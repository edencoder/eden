#!/usr/bin/env node

// false
global.CLI = true;

// Require dependencies
const cluster = require('cluster');
const winston = require('winston');
const { argv } = require('yargs');

// Require local dependencies
// eslint-disable-next-line import/no-dynamic-require
const log = require(`${__dirname}/lib/log`);

/**
 * Create App class
 */
class App {
  /**
   * Construct App class
   */
  constructor() {
    // Bind private variables
    this.master = cluster.isMaster;
    this.logger = false;
    this.workers = {};

    // get cluster
    if (!this.master) {
      // require file
      // eslint-disable-next-line global-require,import/no-dynamic-require
      require(`${process.cwd()}/.edenjs/cluster.${process.env.cluster}.js`);

      // return
      return;
    }

    // Bind public methods
    this.exit = this.exit.bind(this);
    this.spawn = this.spawn.bind(this);
    this.buildLogger = this.buildLogger.bind(this);

    // Build logger
    this.buildLogger();

    // clusters
    if (typeof argv.cluster === 'string') argv.cluster = argv.cluster.split(',');
    if (!argv.cluster) argv.cluster = ['front', 'back'];

    // launch clusters
    argv.cluster.forEach((c) => {
      // launch
      this.spawn(c);
    });

    // On cluster exit
    cluster.on('exit', this.exit);
  }

  /**
   * On cluster worker exit
   *
   * @param {object} worker
   */
  exit(worker) {
    // Spawn new thread
    this.spawn(worker.process.env.cluster);
  }

  /**
   * Spawns new App thread
   *
   * @param {number} id
   * @param {String} label
   * @param {number} port
   */
  spawn(c) {
    // args
    const args = { ...argv, ...process.env };

    // remove cluster
    delete args.cluster;

    // Clone environment and set thread id
    const env = {
      ...args,

      cluster : c,
    };

    // Fork new thread
    this.workers[c] = cluster.fork(env);
    this.workers[c].process.env = env;
  }

  /**
   * Builds logger
   */
  buildLogger() {
    // Set logger
    this.logger = winston.createLogger({
      level      : 'info',
      format     : log,
      transports : [
        new winston.transports.Console(),
      ],
    });
  }
}

/**
 * Export Eden App class
 *
 * @type {App}
 */
module.exports = new App();
