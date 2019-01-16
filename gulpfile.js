// Require environment
require('./lib/env');

// Require dependencies
const fs        = require('fs-extra');
const gulp      = require('gulp');
const path      = require('path');
const glob      = require('@edenjs/glob');
const deepMerge = require('deepmerge');
const Cp        = require('child_process');
const util      = require('util');

// Require local dependencies
const config = require('config');
const parser = require('lib/utilities/parser');

/**
 * Create Loader class
 */
class Loader {
  /**
   * Construct Loader class
   */
  constructor() {
    // Bind public methods
    this.build = this.build.bind(this);
    this.files = this.files.bind(this);
    this.restart = this.restart.bind(this);
    this.merge = util.deprecate(this.merge, 'Please use a custom method instead').bind(this);

    // Bind private methods
    this._task = this._task.bind(this);
    this._watch = this._watch.bind(this);

    this.server = null;
    this.serverRestartingPromise = null;
    this.serverRestartWaiting = false;

    // Run build
    this.build();

    // Add dev server task
    gulp.task('server', gulp.series('install', () => {
      this.restart(true);

      gulp.task('watch')();
    }));

    // Build default task
    gulp.task('default', gulp.series('server'));
  }

  /**
   * Build Loader
   *
   * This has to be a sync method because gulp won't change core to allow async task loading
   */
  build() {
    fs.ensureDirSync(`${global.appRoot}/data/cache`);

    // Glob tasks
    let done = [];

    this._staticLocations = this._genStaticLocations();

    // Get files
    const tasks      = glob.sync(this.files('tasks/*.js'));
    const watchers   = [];
    const installers = [];

    // Loop tasks
    for (const rawTask of tasks) {
      // Load task
      const task = parser.task(rawTask);

      // Create task
      const Task = this._task(task);

      // Add to default task
      if (done.indexOf(task.task) === -1) installers.push(task.task);

      // Push to done
      done.push(task.task);

      // Check befores
      if (task.before) {
        // Push to dones
        done = done.concat(task.before);

        // Remove before from defaults
        for (const taskBefore of task.before) {
          // Set index
          const index = installers.indexOf(taskBefore);

          // Check defaults
          if (index > -1) installers.splice(index, 1);
        }
      }

      // Check afters
      if (task.after) {
        // Push to dones
        done = done.concat(task.after);

        // Remove after from defaults
        for (const taskAfter of task.after) {
          // Set index
          const index = installers.indexOf(taskAfter);

          // Check defaults
          if (index > -1) installers.splice(index, 1);
        }
      }

      // Add watch to watchers
      if (Task.watch) watchers.push(`${task.task}.watch`);
    }

    // Create tasks
    gulp.task('watch', gulp.parallel(...watchers));
    gulp.task('install', gulp.series(...installers));
  }

  async _restart() {
    this.serverRestartingPromise = true;

    if (this.server !== null) {
      const deadPromise =  new Promise(resolve => this.server.once('exit', resolve));
      this.server.kill();
      await deadPromise;
    }

    this.server = Cp.fork(`${__dirname}/index.js`, ['start']);
  }

  /**
   * Restarts dev server
   */
  restart(create = false) {
    // Clearly not a production env
    process.env.NODE_ENV = 'development';

    if (this.server === null && !create) {
      // Nothing to restart, and not initial start
      return;
    }

    if (this.serverRestartWaiting) {
      // Wait for other queue'd task to run instead of ours, they are just as good
      return;
    }

    (async () => {
      let didSetWaiting = false;

      // Already ongoing, lets wait
      if (this.serverRestartingPromise !== null) {
        // Note that we set waiting, so we can unset it
        didSetWaiting = true;
        // Let other callers know we're already waiting
        this.serverRestartWaiting = true;
        // Wait for ongoing task
        await this.serverRestartingPromise;
      }

      // Set ongoing to be our task
      this.serverRestartingPromise = this._restart();

      // Let other callers know we're done waiting
      if (didSetWaiting) this.serverRestartWaiting = false;

      // Await our task
      await this.serverRestartingPromise;

      // Reset ongoing task promise
      this.serverRestartingPromise = null;
    })();
  }

  /**
   * Writes config file
   *
   * @param {string} name
   * @param {object} obj
   */
  async write(name, obj) {
    // Write file
    await fs.writeJson(`${global.appRoot}/data/cache/${name}.json`, obj);
  }

  /**
   * Merges two objects
   *
   * @param   {object} obj1
   * @param   {object} obj2
   *
   * @returns {object}
   */
  merge(obj1, obj2) {
    return deepMerge(obj1, obj2);
  }

  _genStaticLocations() {
    // Get config
    const locals = [].concat(...((config.get('modules') || []).map((p) => {
      // Get paths
      const fullP = path.resolve(p);

      // Return path
      return [
        `${fullP}/node_modules/*/bundles/*/`,
        `${fullP}/node_modules/*/*/bundles/*/`,

        `${fullP}/bundles/*/`,
      ];
    })));

    const filePaths = [];

    if (fs.existsSync(`${global.appRoot}/node_modules`)) {
      filePaths.push(...[
        `${global.appRoot}/node_modules/*/bundles/*/`,
        `${global.appRoot}/node_modules/*/*/bundles/*/`,
      ]);
    }

    filePaths.push(...locals);

    if (fs.existsSync(`${global.appRoot}/bundles`)) {
      filePaths.push(`${global.appRoot}/bundles/*/`);
    }

    return filePaths;
  }

  /**
   * Returns possible file locations for gulp task
   *
   * @param  {string[]|string} files
   *
   * @return {string[]}
   */
  files(files) {
    // Ensure files is an array
    const filesArr = !Array.isArray(files) ? [files] : files;

    let filtered = [];

    // Combine locations with the searched files
    this._staticLocations.forEach((loc) => {
      filesArr.forEach((file) => {
        filtered.push(loc + file);
      });
    });

    // Return reverse-deduplicated files
    filtered = filtered.reduceRight((accum, loc) => {
      if (!accum.includes(loc)) accum.unshift(loc);
      return accum;
    }, []);

    return filtered;
  }

  /**
   * Runs gulp task
   *
   * @param   {object} task
   *
   * @returns {*}
   *
   * @private
   */
  _task(task) {
    // Create task
    let Task = require(task.file); // eslint-disable-line global-require, import/no-dynamic-require

    // New task
    Task = new Task(this);

    // Create gulp task
    gulp.task(`${task.task}.run`, () => {
      // return task
      return Task.run(Task.watch ? this.files(Task.watch()) : undefined);
    });

    // Create task args
    let args = [];

    // Check before
    if (task.before && task.before.length) {
      // Push to args
      args = args.concat(task.before);
    }

    // Push actual function
    args.push(`${task.task}.run`);

    // Check after
    if (task.after && task.after.length) {
      // Push to args
      args = args.concat(task.after);
    }

    // Create task
    gulp.task(task.task, gulp.series(...args));

    // Check watch
    if (Task.watch) {
      // Create watch task
      this._watch(task.task, Task);
    }

    // Return task
    return Task;
  }

  /**
   * Creates watch task
   *
   * @param {string} task
   * @param {*} Task
   *
   * @private
   */
  _watch(task, Task) {
    // Create watch task
    gulp.task(`${task}.watch`, () => {
      // return watch
      return gulp.watch(this.files(Task.watch()), gulp.series(task));
    });
  }
}

/**
 * Export new Loader instance
 *
 * @type {Loader}
 */
module.exports = new Loader();
