"use strict";
var Lab    = require("lab");
var plugin = require("..");

var describe = Lab.describe;
var expect   = Lab.expect;
var it       = Lab.it;

describe("The plugin", function () {

	it("has a name", function (done) {
		expect(plugin.register.attributes, "no name")
		.to.have.property("name", "badge");

		done();
	});

	it("has a version", function (done) {
		expect(plugin.register.attributes, "no version")
		.to.have.property("version");

		done();
	});
});
