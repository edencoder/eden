/**
 * Created by Awesome on 2/21/2016.
 */

'use strict';

// require local dependencies
var controller = require('../../core/controller');
var user       = require('../model/user');

// require dependencies
var co = require('co');

/**
 * create user controller
 */
class userController extends controller {
    /**
     * constructor for user controller
     * @param props
     */
    constructor(props) {
        super(props);

        // bind methods
        this.authAction      = this.authAction.bind(this);
        this.loginAction     = this.loginAction.bind(this);
        this.loginFormAction = this.loginFormAction.bind(this);
    }

    /**
     * auth action
     *
     * @param req
     * @param res
     * @param next
     *
     * @priority 1
     * @route {all} /*
     */
    authAction(req, res, next) {
        console.log('working');
        next();
    }

    /**
     * login action
     * @param req
     * @param res
     *
     * @route {get} /login
     * @menu {{"name":"LOGIN","menu":"MAIN","priority":1}} Login
     */
    loginAction(req, res) {
        res.render('login', {});
    }

    /**
     * login Form action
     * @param req
     * @param res
     *
     * @route {post} /login
     */
    loginFormAction(req, res) {
        co(function * () {
            let User = yield user.where({
                'username' : req.body.user
            }).findOne();

            if (!User) {
                res.render('login', {
                    'error' : 'User not found',
                    'form' : {
                        'old': req.body
                    }
                });
            }
        });
    }
}

/**
 * user controller
 * @type {userController}
 */
module.exports = userController;