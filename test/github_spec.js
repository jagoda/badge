"use strict";
var Hapi   = require("hapi");
var Lab    = require("lab");
var Nipple = require("nipple");
var nock   = require("nock");
var plugin = require("..");
var sinon  = require("sinon");

var after    = Lab.after;
var before   = Lab.before;
var describe = Lab.describe;
var expect   = Lab.expect;
var it       = Lab.it;

var GITHUB_API = "https://api.github.com";
var LOGIN      = "octocat";
var USERNAME   = "testy";
var PASSWORD   = "password";

function basicAuth (username, password) {
	return "Basic " +
		(new Buffer(username + ":" + password)).toString("base64");
}

describe("The GitHub basic auth scheme", function () {
	before(function (done) {
		nock.disableNetConnect();
		done();
	});

	after(function (done) {
		nock.enableNetConnect();
		done();
	});

	describe("using the default configuration", function () {
		var server;

		function userRequest () {
			return nock(GITHUB_API)
			.matchHeader("Authorization", basicAuth(USERNAME, PASSWORD))
			.get("/user");
		}

		function authenticate (callback) {
			server.inject(
				{
					headers : {
						authorization : basicAuth(USERNAME, PASSWORD)
					},

					method : "GET",
					url    : "/"
				},
				callback
			);
		}

		before(function (done) {
			server = new Hapi.Server();
			server.pack.register(plugin, function (error) {
				server.auth.strategy("default", "github-basic");
				server.route(
					{
						config : {
							auth : {
								mode    : "try",
								strategy : "default"
							}
						},

						handler : function (request, reply) {
							reply(request.auth);
						},

						method : "GET",
						path   : "/"
					}
				);
				done(error);
			});
		});

		describe("with valid credentials", function () {
			var request;
			var response;

			before(function (done) {
				request = userRequest().reply(200, { login : LOGIN });
				authenticate(function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				nock.cleanAll();
				done();
			});

			it("verifies the credentials with GitHub", function (done) {
				expect(request.isDone(), "no request to GitHub").to.be.true;
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", LOGIN);

				done();
			});

			it("permits the request", function (done) {
				expect(response.result.isAuthenticated, "not permitted")
				.to.be.true;

				done();
			});
		});

		describe("with invalid credentials", function () {
			var request;
			var response;

			before(function (done) {
				request = userRequest().reply(401);
				authenticate(function (_response_) {
					response = _response_;
					done();
				});
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", USERNAME);

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("failing to contact GitHub", function () {
			var response;
			var getStub;

			before(function (done) {
				getStub = sinon.stub(
					Nipple, "get",
					function (uri, options, callback) {
						callback(new Error("boom!"));
					}
				);

				authenticate(function (_response_) {
					response = _response_;
					done();
				});
			});

			after(function (done) {
				getStub.restore();
				done();
			});

			it("returns the username", function (done) {
				expect(response.result.credentials, "no username")
				.to.have.property("username", USERNAME);

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});

		describe("without a basic credential", function () {
			var response;

			before(function (done) {
				server.inject(
					{
						method : "GET",
						url    : "/"
					},
					function (_response_) {
						response = _response_;
						done();
					}
				);
			});

			it("does not return a username", function (done) {
				expect(response.result.credentials.username, "username")
				.not.to.exist;

				done();
			});

			it("prohibits the request", function (done) {
				expect(response.result.isAuthenticated, "permitted")
				.to.be.false;

				done();
			});
		});
	});

	describe("configured with client credentials", function () {

		describe("with valid credentials", function () {

			it("returns the username");

			it("returns an API token");

			it("permits the request");
		});

		describe("with invalid credentials", function () {

			it("returns the username");

			it("does not return and API token");

			it("prohibits the request");
		});
	});

	describe("configured without a client ID", function () {

		it("fails");
	});

	describe("configured without a client secret", function () {

		it("fails");
	});

	describe("configured without a list of scopes", function () {

		it("fails");
	});

	describe("configured without a note", function () {

		it("fails");
	});

	describe("configured without a URL", function () {

		it("fails");
	});
});

describe("The GitHub token auth scheme", function () {

	describe("using the default configuration", function () {

		describe("with a valid token", function () {

			it("returns the username");

			it("permits the request");
		});

		describe("with an invalid token", function () {

			it("returns the token");

			it("does not return the username");

			it("prohibits the request");
		});
	});

	describe("configured with an organization", function () {

		describe("with a token belonging to the organization", function () {

			it("returns the username");

			it("permits the requets");
		});

		describe("with a token not belonging to the organization", function () {

			it("returns the username");

			it("prohibits the request");
		});
	});

	describe("configured without a client ID", function () {

		it("fails");
	});

	describe("configured without a client secret", function () {

		it("fails");
	});
});
