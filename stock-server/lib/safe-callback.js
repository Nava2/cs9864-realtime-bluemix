const _ = require('lodash');

module.exports = function Safe(next) {
  if (_.isFunction(next) && (next.name === '__safeNextCallback__')) {
    return next;
  }

  function __safeNextCallback__(err) {
    if (_.isFunction(next)) {
      next(err);
    } else if (!!err) {
      throw err;
    }
  }

  return __safeNextCallback__;
};
