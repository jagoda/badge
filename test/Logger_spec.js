"use strict";
var Lab    = require("lab");
var Logger = require("../lib/Logger");
var sinon  = require("sinon");

var before   = Lab.before;
var describe = Lab.describe;
var expect   = Lab.expect;
var it       = Lab.it;

describe("A Logger", function () {
	describe("without any tags", function () {
		var logger;
		var spy;

		before(function (done) {
			spy    = sinon.spy();
			logger = new Logger({ log : spy });

			logger.info("%s: %s", "prompt", "message");
			logger.warn("%s: %d", "number", 1);
			logger.error("%s: %j", "object", { foo : "bar" });

			done();
		});

		it("can create a formatted 'info' message", function (done) {
			expect(spy.firstCall.args[0], "incorrect tags")
			.to.deep.equal([ "info" ]);

			expect(spy.firstCall.args[1], "incorrect message")
			.to.equal("prompt: message");

			done();
		});

		it("can create a formatted 'warn' message", function (done) {
			expect(spy.secondCall.args[0], "incorrect tags")
			.to.deep.equal([ "warn" ]);

			expect(spy.secondCall.args[1], "incorrect message")
			.to.equal("number: 1");

			done();
		});

		it("can create a formatted 'error' message", function (done) {
			expect(spy.thirdCall.args[0], "incorrect tags")
			.to.deep.equal([ "error" ]);

			expect(spy.thirdCall.args[1], "incorrect message")
			.to.equal("object: {\"foo\":\"bar\"}");

			done();
		});
	});

	describe("with tags", function () {
		var logger;
		var spy;

		before(function (done) {
			spy    = sinon.spy();
			logger = new Logger({ log : spy }, [ "tag1", "tag2" ]);

			logger.info("%s: %s", "prompt", "message");
			logger.warn("%s: %d", "number", 1);
			logger.error("%s: %j", "object", { foo : "bar" });

			done();
		});

		it("can create a formatted 'info' message", function (done) {
			expect(spy.firstCall.args[0], "incorrect tags")
			.to.deep.equal([ "info", "tag1", "tag2" ]);

			expect(spy.firstCall.args[1], "incorrect message")
			.to.equal("prompt: message");

			done();
		});

		it("can create a formatted 'warn' message", function (done) {
			expect(spy.secondCall.args[0], "incorrect tags")
			.to.deep.equal([ "warn", "tag1", "tag2" ]);

			expect(spy.secondCall.args[1], "incorrect message")
			.to.equal("number: 1");

			done();
		});

		it("can create a formatted 'error' message", function (done) {
			expect(spy.thirdCall.args[0], "incorrect tags")
			.to.deep.equal([ "error", "tag1", "tag2" ]);

			expect(spy.thirdCall.args[1], "incorrect message")
			.to.equal("object: {\"foo\":\"bar\"}");

			done();
		});
	});
});
