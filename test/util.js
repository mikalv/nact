const { delay } = require('bluebird').Promise;

module.exports.retry = async (assertion, remainingAttempts, retryInterval = 0) => {
    if (remainingAttempts <= 1) {
        return assertion();
    } else {
        try {
            assertion();
        } catch (e) {
            await delay(retryInterval);
            await exports.retry(assertion, remainingAttempts - 1, retryInterval);
        }
    }
};


module.exports.ignore = () => { };
