const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const should = chai.should();
const { start } = require('../lib');
const { Promise } = require('bluebird');
const { LocalPath } = require('../lib/paths');
const { ActorReference } = require('../lib/references');
const { Actor } = require('../lib/actor');
const { ignore, retry } = require('./util');
const delay = Promise.delay;

const spawnChildrenEchoer = (parent, name) => parent.spawnFixed((msg, { sender, children, tell }) => {
  tell(sender, [...children.keys()]);
}, name);

describe('ActorReference', function () {
  let system = undefined;
  beforeEach(() => system = start());
  afterEach(() => system.terminate());

  it('should have properties: name, path, parent,', function () {
    let child = system.spawnFixed(ignore);
    let grandchild = child.spawnFixed(ignore);
    child.parent.should.equal(system);
    grandchild.parent.should.equal(child);
    child.name.should.be.a('string');
    child.path.should.be.instanceOf(LocalPath);
  });

  describe('function', function () {
    it(`should have the following properties in its context object: 
        - name
        - path
        - self
        - parent
        - sender
        - tell
        - spawn
        - spawnFixed`,
      async function () {
        let child = system.spawnFixed(async function (_, context) {
          this.tell(this.sender, context);
        });
        let context = await child.ask();
        context.should.include.keys(
          'name',
          'path',
          'self',
          'parent',
          'sender',
          'tell',
          'spawn',
          'spawnFixed'
        );
      });

    it('allows promises to resolve inside actor', async function () {
      let child = system.spawnFixed(async function (msg) {
        let result = await Promise.resolve(2);
        this.tell(this.sender, result);
      });

      let result = await child.ask();
      result.should.equal(2);
    });

    it('stops actor when returning a promise which resolves to false.', async function () {
      let child = system.spawnFixed(() => Promise.resolve(false));
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
    });

    it('stops actor after returning a falsy value when started with spawnFixed', async function () {
      let child = system.spawnFixed(() => false, 'testActor');
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
      system.children().should.not.include('testActor');
    });

    it('stops actor after returning a non-function when started with spawn', async function () {
      let child = system.spawn(() => (msg) => { }, 'testActor');
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
      system.children().should.not.include('testActor');
    });

    it('allows statful behaviour using trampolining', async function () {
      let statefulActor = system.spawn(() => {
        let initialState = '';
        let f = (state) => function (msg) {
          if (msg.type === 'query') {
            this.tell(this.sender, state);
            return f(state);
          } else if (msg.type === 'append') {
            return f(state + msg.payload);
          }
        };
        return f(initialState);
      });

      statefulActor.tell({ payload: 'Hello ', type: 'append' });
      statefulActor.tell({ payload: 'World. ', type: 'append' });
      statefulActor.tell({ payload: 'The time has come!!', type: 'append' });
      let result = await statefulActor.ask({ type: 'query' });
      result.should.equal('Hello World. The time has come!!');
    });

    it('evalutes in order, even when returning a promise', async function () {
      let child = system.spawnFixed(async function (msg) {
        if (msg === 2) {
          await delay(10);
        }
        this.tell(this.sender, msg);
      }, 'testActor');

      let result1 = await child.ask(1);
      let result2 = await child.ask(2);
      let result3 = await child.ask(3);
      result1.should.equal(1);
      result2.should.equal(2);
      result3.should.equal(3);
    });

    it('should automatically terminate actor with failure if a non function or falsy type is returned', async function () {
      let child = system.spawn((msg) => () => 1);
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
    });

    it('should automatically terminate actor if an error is thrown', async function () {
      // TODO: Possibly not the most sensible error policy. 
      // Really need to think about how supervision and error handling work
      let child = system.spawnFixed((msg) => { throw new Error('testError') });
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
    });

    it('should terminate actor if rejected promise is thrown', async function () {
      let child = system.spawnFixed((msg) => Promise.reject(new Error('testError')));
      child.tell();
      await retry(() => child.isStopped().should.be.true, 12, 10);
    });

  });

  describe('#stop()', function () {
    it('should prevent children from being spawned after being called', function () {
      let child = system.spawnFixed(ignore);
      child.stop();
      (() => child.spawnFixed(ignore)).should.throw(Error);
      (() => child.spawnFixed(() => ignore)).should.throw(Error);
    });

    it('stops children when parent is stopped', async function () {
      let actor = spawnChildrenEchoer(system);
      let child1 = spawnChildrenEchoer(actor, 'child1');
      let child2 = spawnChildrenEchoer(actor, 'child2');
      let grandchild1 = child1.spawnFixed(ignore, 'grandchild1');
      let grandchild2 = child1.spawnFixed(ignore, 'grandchild2');

      child1.stop();
      child1.isStopped().should.be.true;
      grandchild1.isStopped().should.be.true;
      grandchild2.isStopped().should.be.true;

      system.stop();
      system.children().should.be.empty;
      actor.isStopped().should.be.true;
      child2.isStopped().should.be.true;
    });


    it('should be able to be invoked multiple times', async function () {
      let child = system.spawn(ignore);
      child.stop();
      await retry(() => child.isStopped().should.be.true, 12, 10);
      child.stop();
      child.isStopped().should.be.true;
    });

    it('should ignore subsequent tells', async function () {
      let child = system.spawnFixed(() => { throw new Error('Should not be triggered'); });
      child.stop();
      await retry(() => child.isStopped().should.be.true, 12, 10);
      child.tell('test');
    });

  });

  describe('#terminate()', function () {

    it('should prevent children from being spawned after being called', function () {
      let child = system.spawnFixed(() => console.log('spawning'));
      child.terminate();
      (() => child.spawnFixed(() => console.log('spawning'))).should.throw(Error);
      (() => child.spawn(() => () => console.log('spawning'))).should.throw(Error);
    });

    it('should be able to be invoked multiple times', async function () {
      let child = system.spawn(ignore);
      child.terminate();
      await retry(() => child.isStopped().should.be.true, 12, 10);
      child.terminate();
      child.isStopped().should.be.true;
    });

    it('terminates children when parent is terminated', async function () {
      let actor = spawnChildrenEchoer(system);
      let child1 = spawnChildrenEchoer(actor, 'child1');
      let child2 = spawnChildrenEchoer(actor, 'child2');
      let grandchild1 = child1.spawnFixed(ignore, 'grandchild1');
      let grandchild2 = child1.spawnFixed(ignore, 'grandchild2');

      child1.terminate();

      child1.isStopped().should.be.true;
      grandchild1.isStopped().should.be.true;
      grandchild2.isStopped().should.be.true;

      system.terminate();
      system.children().should.be.empty;
      actor.isStopped().should.be.true;
      child2.isStopped().should.be.true;

    });

  });

  describe('#spawn()', function () {
    it('automatically names an actor if a name is not provided', function () {
      let child = system.spawnFixed((msg) => msg);
      system.children().size.should.equal(1);
      child.name.should.not.be.undefined;
    });

    it('should prevent a child with the same name from being spawned', function () {
      let child = system.spawnFixed(ignore);
      child.spawnFixed(ignore, 'grandchild');
      (() => child.spawnFixed(ignore, 'grandchild')).should.throw(Error);
    });

    it('correctly registers children upon startup', async function () {
      let child = spawnChildrenEchoer(system, 'testChildActor');
      system.children().should.have.keys('testChildActor');
      let children = await child.ask();
      children.should.be.empty;

      let grandchild = child.spawnFixed(ignore, 'testGrandchildActor');
      child.children().should.have.keys('testGrandchildActor');
      children = await child.ask();
      children.should.have.members(['testGrandchildActor']);

      let grandchild2 = child.spawnFixed(ignore, 'testGrandchildActor2');
      children = await child.ask();
      child.children().should.have.keys('testGrandchildActor2', 'testGrandchildActor');
      children.should.have.members(['testGrandchildActor2', 'testGrandchildActor']);
    });

    it('can be invoked from within actor', async function () {
      let actor = system.spawnFixed((msg, ctx) => {
        if (msg === 'spawn') {
          ctx.spawnFixed((msg) => { }, 'child1');
          ctx.spawn((msg) => { }, 'child2');
        } else {
          ctx.tell(ctx.sender, [...ctx.children.keys()]);
        }
      }, 'test');
      actor.tell('spawn');
      let children = await actor.ask('query');
      children.should.have.members(['child1', 'child2']);
      actor.children().should.have.keys('child1', 'child2');
    });

  });

  describe('#ask()', function () {

    it(`should reject a promise if actor has already stopped`, function () {
      let actor = system.spawnFixed(ignore);
      actor.stop();
      return delay(5).then(() => actor.ask()).should.be.rejectedWith(Error, 'Actor stopped. Ask can never resolve');
    });

    it(`should reject a promise if the actor hasn't responded with the given timespan`, function () {
      let actor = system.spawnFixed(
        async (msg, ctx) => { await delay(10); ctx.tell(ctx.sender, 'done'); },
        'test'
      );
      return actor.ask('test', 1).should.be.rejectedWith(Error, 'Ask Timeout');
    });

    it(`should resolve the promise if the actor has responded with the given timespan, clearing the timeout`, function () {
      let actor = system.spawnFixed(
        async (msg, ctx) => { await delay(10); ctx.tell(ctx.sender, 'done'); },
        'test'
      );
      return actor.ask('test', 30).should.be.fulfilled;
    });


  });

  describe('#tell()', function () {

    it('telling inside actor with non addressable recipient type should throw error', async function () {
      let child = system.spawnFixed(function (msg) {
        try {
          this.tell({}, 'test');
        } catch (e) {
          this.tell(this.sender, e);
        }
      });
      let result = await child.ask();
      result.should.be.an('error');
    });

    it('should be able to tell other actors', async function () {
      let child1 = system.spawnFixed(function (msg) { this.tell(msg, this.sender); });
      let child2 = system.spawnFixed(function (msg) { this.tell(msg, 'hello from child2'); });
      let result = await child1.ask(child2);
      result.should.equal('hello from child2');
    });

  });

});