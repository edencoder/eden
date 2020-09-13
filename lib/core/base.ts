// Require class dependencies
import eden from 'eden';
import dotProp from 'dot-prop';
import { EventEmitter } from 'events';

/**
 * Create Base class
 */
export default class Base extends EventEmitter {
  /**
   * Construct Base class
   */
  constructor() {
    // Run super
    super();

    // data
    this.__data = {};

    // bind
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);

    // Bind public variables
    this.eden = eden;
    this.call = eden.call;
    this.logger = eden.logger;
  }

  /**
   * set key/value
   *
   * @param {*} key
   * @param {*} value
   */
  set(key, value) {
    // set value
    dotProp.set(this.__data, key, value);

    // got
    const got = this.get(key);

    // emit value
    this.emit(key.split('.')[0], got);

    // return get key
    return got;
  }

  /**
   * get value
   *
   * @param {*} key
   * @param {*} value
   */
  get(key, value) {
    // check value
    const actualValue = dotProp.get(this.__data, key);

    // check value
    if (typeof actualValue === 'undefined' && value) {
      // set
      this.set(key, value);

      // return get
      return this.get(key);
    }

    // return actual value
    return actualValue;
  }
}