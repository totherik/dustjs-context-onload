'use strict';


var test = require('tape'),
    dust = require('dustjs-linkedin'),
    contextify = require('../');


test('dustjs-onload-context', function (t) {

    function run(iterations, fn, complete) {
        var awaiting = 0;

        (function go() {

            awaiting += 1;
            fn(function () {
                awaiting -= 1;
                if (!iterations && !awaiting) {
                    complete();
                }
            });

            if (iterations) {
                setImmediate(go);
                iterations -= 1;
            }

        }());
    }

    // From: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }


    t.test('with context', function (t) {
        var undo = contextify();

        t.plan(9);

        dust.onLoad = function (name, context, cb) {
            t.equals(name, 'index');
            t.equals(typeof context, 'object');
            t.equals(context.get('name'), 'world');
            t.equals(typeof cb, 'function');
            cb(null, 'Hello, {name}!');
        };

        dust.render('index', { name: 'world' }, function (err, data) {
            t.error(err);
            t.equal(data, 'Hello, world!');
            t.equal(dust.cache.index, undefined);
            t.equal(dust.load.name, 'cabbage');

            undo();

            t.equal(dust.load.name, '');
            setImmediate(t.end.bind(t));
        });

    });


    t.test('prime cache on load', function (t) {
        var undo = contextify();

        t.plan(9);

        dust.onLoad = function (name, context, cb) {
            t.equals(name, 'index');
            t.equals(typeof context, 'object');
            t.equals(context.get('name'), 'world');
            t.equals(typeof cb, 'function');

            dust.loadSource(dust.compile('Hello, {name}!', 'index'));
            cb();
        };

        dust.render('index', { name: 'world' }, function (err, data) {
            t.error(err);
            t.equal(data, 'Hello, world!');
            t.equal(dust.cache.index, undefined);
            t.equal(dust.load.name, 'cabbage');

            undo();

            t.equal(dust.load.name, '');
            setImmediate(t.end.bind(t));
        });

    });


    t.test('error', function (t) {
        var undo = contextify();

        t.plan(7);

        dust.silenceErrors = true;
        dust.onLoad = function (name, context, cb) {
            t.ok(name);
            t.ok(context);
            t.ok(cb);
            cb(new Error('test'));
        };

        dust.render('index', { name: 'world' }, function (err, data) {
            t.ok(err);
            t.equal(data, undefined);
            t.equal(dust.load.name, 'cabbage');

            undo();

            t.equal(dust.load.name, '');
            setImmediate(t.end.bind(t));
        });

    });


    t.test('primed template', function (t) {
        var undo = contextify();

        t.plan(2);

        dust.onLoad = function (name, context, cb) {
            cb(new Error('Should not be called'));
        };

        // XXX: This template will not be automatically removed
        dust.loadSource(dust.compile('Hello, {name}!', 'index'));
        dust.render('index', { name: 'world' }, function (err, data) {
            t.error(err);
            t.equal(data, 'Hello, world!');

            dust.cache = {};
            undo();

            t.end();
        });

    });


    t.test('undo', function (t) {
        var undo = contextify();

        t.plan(5);

        dust.onLoad = function (name, context, cb) {
            switch (name) {
                case 'index':
                    setImmediate(cb.bind(null, null, 'Hello, {>"partial"/}!'));
                    break;
                case 'partial':
                    setImmediate(cb.bind(null, null, '{name}'));
                    break;
            }
        };

        dust.render('index', { name: 'world'}, function (err, data) {
            t.error(err);
            t.equal(data, 'Hello, world!');
            t.equal(dust.load.name, 'cabbage');

            setImmediate(function () {
                t.strictEqual(undo(), true);
                t.equal(dust.load.name, '');
                t.end();
            });
        });

    });


    t.test('race conditions', function (t) {
        var undo = contextify();

        dust.onLoad = function (name, context, cb) {
            var template;

            switch (name) {
                case 'index':
                    template = 'Hello, {>"partial1"/}!';
                    break;
                case 'partial1':
                    template = '<em>{>"partial2"/}</em>';
                    break;
                case 'partial2':
                    template = '{name}';
                    break;
                default:
                    template = '';
            }

            cb(null, template);
        };

        function exec(done) {
            var undo = contextify();
            dust.render('index', { name: 'world' }, function (err, data) {
                t.error(err, 'no error');
                t.equal(data, 'Hello, <em>world</em>!', 'rendered correctly');
                t.equal(typeof undo(), 'boolean');
                done();
            });
        }

        function complete() {
            t.equal(dust.load.name, '');
            t.strictEqual(undo(), false); // ensure subsequent `undo` is noop
            t.equal(dust.load.name, '');

            setImmediate(t.end.bind(t));
        }

        run(1000, exec, complete);

    });

    t.test('caching', function (t) {
        var undo = contextify({ cache: false });

        t.plan(6);

        dust.onLoad = function (name, context, cb) {
            var template;

            switch (name) {
                case 'index':
                    template = 'Bonjour, {>"partial"/}';
                    break;
                case 'partial':
                    template = '{name}!';
                    break;
                default:
                    template = '';
            }

            setImmediate(cb.bind(null, null, template));
        };

        dust.render('index', { name: 'world' }, function (err, data) {
            t.error(err);
            t.equal(data, 'Bonjour, world!');

            // At this point, at least one template still exists in cache
            // since removal happens after this callback is invoked by dust
            // internally.
            t.equal(dust.cache['index'], undefined);
            t.equal(dust.cache['partial'], undefined);
            t.equal(Object.keys(dust.cache).length, 0);
            t.strictEqual(undo(), true);
            t.end();
        });
    });

});