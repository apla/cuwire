var tokenEntry = require ('dataflo.ws/initiator/token');
var EventEmitter = require ('events').EventEmitter;

var util = require ('util');
var path = require ('path');

var ayepromise = require ('ayepromise');

var common = require ("./common");

var flowJSON = require ("./flows.json");

function CuwireFlows () {
	var self = this;

	this.entry = new tokenEntry ({
		flows: flowJSON.flows
	});

	this.flowTemplates = flowJSON.templates;

}

util.inherits (CuwireFlows, EventEmitter);

var cuwireFlows = new CuwireFlows ();

module.exports = cuwireFlows;

CuwireFlows.prototype.log = function () {
	if (arguments[0] === 'error') {
		console.error.apply (console, arguments);
	}
}

CuwireFlows.prototype.launch = function (token, data, cb, errb) {

	var deferred = ayepromise.defer();

	var df = this.entry.process (token, {
		autoRun: 0,
		data: data || {},
		templates: this.flowTemplates,
		//_log: this.log.bind (this)
	});

	df.on ('completed', function (df) {
		deferred.resolve (df.data);
		cb && cb(df.data);
	}.bind(this));

	df.on ('failed', function (df) {
		deferred.reject (df.data);
		errb && errb (df.data);
	});

	df.run();

	var promise = deferred.promise;
	promise.flow = df;

	return promise;

}

cuwireFlows.unzip = function (zipFile, targetFolder, options) {
	var deferred = ayepromise.defer();

	options = options || {};

	var yauzl = require("yauzl");
	var fs = require("fs");

	var archiveFiles = [], archiveFolders = [];

	var status = 'resolve';

	yauzl.open (zipFile, function(err, zipfile) {
		if (err) throw err;
		var remains = 0;
		zipfile.on ("entry", function(entry) {
			if (/\/$/.test(entry.fileName)) {
				// directory file names end with '/'
				archiveFolders.push (entry.fileName);
				return;
			}
			archiveFiles.push (entry);
			zipfile.openReadStream (entry, function(err, readStream) {
				remains++;
//				console.log (targetFolder, entry.fileName);

				var entryFile   = path.join (targetFolder, entry.fileName);
				if (options.replacePath) {
					entryFile = entryFile.replace (options.replacePath[0], options.replacePath[1])
				}
				var entryFolder = path.dirname (entryFile);

				common.mkdirParent (
					entryFolder,
					function () {
						var writeStream = fs.createWriteStream (entryFile);
						writeStream.on ('error', function (error) {
							remains --;
							status = 'reject';
							console.log (error);
							if (!remains) {
								deferred[status] ();
							}
						});
						readStream.on ('end', function () {
							remains --;
							if (!remains) {
								deferred[status] ();
							}
						})
						readStream.pipe (writeStream);
					}
				);
			});
		});
		// archive read complete
		zipfile.on ('end', function () {
		});
	});



	return deferred.promise;
}

var zipData = {
	url: "https://github.com/cuwire/RFduino/archive/master.zip",
	folder: "/Users/apla/tmp/rfd"
};

//var promiseZip = cuwireFlows.launch ("installFromZip", zipData);

var arduinoSiteData = {
	libraries: "http://downloads.arduino.cc/libraries/library_index.json",
	packages:  "http://downloads.arduino.cc/packages/package_index.json",
};

var promiseAData = cuwireFlows.launch ("arduinoSiteData", arduinoSiteData);
promiseAData.then (function () {
	var flowData = promiseAData.flow.data;
	console.log (JSON.parse (flowData.libraries.data));
	console.log (JSON.parse (flowData.packages.data));
});

var gitData = {
	url: "https://github.com/cuwire/RFduino",
	folder: "/Users/apla/tmp/rfd"
};

//var promise = cuwireFlows.launch ("installFromGit", gitData);



