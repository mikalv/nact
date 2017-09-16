const SupervisionDirective = {
    Restart: Symbol('Restart'),
    Continue: Symbol('Continue'),
    Escalate: Symbol('Escalate'),
    Stop: Symbol('Stop')
};


class OneForAllStrategy {
    constructor(f, params = {}) {
        const { maxNrOfRetries, withinTimeRange } = params;
        this.maxNrOfRetries = maxNrOfRetries;
        this.withinTimeRange = withinTimeRange;
        this.f = f;
    }

    decide(parent, child, error) {
        const result = this.f(errorContext) || SupervisionDirective.Escalate;
        return result;
    }
}

class OneForOneStrategy {
    constructor(f, params = {}) {
        const { maxNrOfRetries, withinTimeRange } = params;
        this.maxNrOfRetries = maxNrOfRetries;
        this.withinTimeRange = withinTimeRange;
        this.f = f;
    }

    decide(parent, errorContext) {
        const result = this.f(errorContext) || SupervisionDirective.Escalate;
        return result;
    }
}

const oneForOne = (f) => { }

const oneForAll = (f) => { }

module.exports.SupervisionDirective = SupervisionDirective;
module.exports.defaultStrategy = new OneForOneStrategy(() => SupervisionDirective.Stop);


