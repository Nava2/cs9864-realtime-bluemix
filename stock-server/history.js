'use strict';

const moment = require('moment');
const _ = require('lodash');

const DEFAULT_OFFSET = moment([2011, 0, 13, 9, 30, 0]);

class History {

  /**
   *
   * @param [OFFSET] {moment} Optional start time, if not specified uses `moment.now()`.
   */
  constructor(OFFSET) {
    this._OFFSET = (moment.isMoment(OFFSET) ? OFFSET : DEFAULT_OFFSET);
    this._START = moment();
  }

  get start() {
    return this._START;
  }

  get offset() {
    return this._OFFSET;
  }

  /**
   * Get the relative date/time
   * @returns {Object} Moment descendant
   */
  get nowish() {
    return this.offset.clone()
      .add(moment().unix(), 's')
      .subtract(this.start.unix(), 's');
  }
}

module.exports = {
  History: History,
  DEFAULT_OFFSET: DEFAULT_OFFSET
};