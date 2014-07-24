"use strict";
let fs      = require("fs");
let gulp    = require("gulp");
let jshint  = require("gulp-jshint");
let lab     = require("gulp-lab");
let path    = require("path");
let stylish = require("jshint-stylish");
let _       = require("lodash");

const JSHINTRC     = ".jshintrc";
const SOURCE_FILES = [ "*.js", "lib/**/*.js" ];
const TEST_FILES   = [ "test/**/*_spec.js" ];

function runJshint (files, overrides) {
	let options = JSON.parse(fs.readFileSync(path.join(__dirname, JSHINTRC)));
	
	if (overrides) {
		let additions = JSON.parse(fs.readFileSync(overrides));
		options = _.merge(options, additions);
	}

	return gulp.src(files)
	.pipe(jshint(options))
	.pipe(jshint.reporter(stylish))
	.pipe(jshint.reporter("fail"));
}

gulp.task("default", [ "test" ]);

gulp.task("lint", [ "lint-src", "lint-test" ]);

gulp.task("lint-src", function () {
	return runJshint(SOURCE_FILES);
});

gulp.task("lint-test", function () {
	return runJshint(TEST_FILES, path.join(__dirname, "test", JSHINTRC));
});

gulp.task("test", [ "lint" ], function () {
	return gulp.src(TEST_FILES)
	.pipe(lab({
		// FIXME: should only ignore Proxy global once patch is published.
		args : "-l -p",
		opts : {
			emitLabError : true
		}
	}));
});

// This is useful for CI systems.
gulp.on("err", function (error) {
	console.error("%s: %s", error.message, error.err.message);
	console.error(error.err.stack);
	process.exit(1);
});

if (require.main === module) {
	gulp.start("default");
}
