"use strict";
var util = require("util");
var _    = require("lodash");

function log (plugin, tags) {
	var args    = Array.prototype.slice.call(arguments, 2);
	var message = util.format.apply(util, args);

	return plugin.log(tags, message);
}

function Logger (plugin, tags) {
	var logger = this;

	_.each([ "error", "info", "warn" ], function (level) {
		logger[level] = log.bind(null, plugin, [ level ].concat(tags || []));
	});
}

module.exports = Logger;
