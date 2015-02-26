var common = require ('./common');
var ArduinoData = require ('./data');

var arduino = new ArduinoData ("/Applications/devel/Arduino.app");

arduino.on ('done', (function () {

	console.log (arduino.examples);

	console.log (arduino.folders);

//	arduino.exampleFolders.forEach (function () {
//
//	});

	return;
	var runtimeFound = [];
	for (var folderName in this.arduino.folders) {
		var folderData = this.arduino.folders[folderName];
		if (folderData.runtime && folderData.modern) {
			runtimeFound.push ([folderName, folderData]);
		}
	}

}).bind (this));

function compileSample (path) {

}
