// parsing query string
var qs = (function(a) {
	if (a == "") return {};
	var b = {};
	for (var i = 0; i < a.length; ++i)
	{
		var p=a[i].split('=', 2);
		if (p.length == 1)
			b[p[0]] = "";
		else
			b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
	}
	return b;
})(window.location.search.substr(1).split('&'));

window.bracketsWwwPath = qs.bracketsIndexPath.replace ('index.html', '');

document.getElementById ('brackets-min-css').href  = bracketsWwwPath + 'styles/brackets.min.css';

function setStage (stage) {
	setStage[stage] = true;
	if (("requireJsParsed" in setStage) && ("thirdpartyLoaded" in setStage)) {
		document.getElementById ('thirdparty-require-js').src = bracketsWwwPath + "thirdparty/requirejs/require.js";
	}
}

var thirdpartyJs = document.getElementById ('thirdparty-min-js');
thirdpartyJs.addEventListener ('load', setStage.bind (window, "thirdpartyLoaded"), false);
thirdpartyJs.src = bracketsWwwPath + 'thirdparty/thirdparty.min.js';
