cd node
npm install node-gyp node-pre-gyp serialport
cd node_modules/serialport
/Applications/devel/Brackets.app/Contents/MacOS/Brackets-node ../../node_modules/node-pre-gyp/bin/node-pre-gyp --arch=ia32 rebuild
