---
layout: post
title:  "QuickEdit"
date:   2015-01-31 19:45:47
categories: cuwire serial
lead: Inline editor, symbol navigation, and more!
---

Next milestone in cuwire IDE development. Integration features:

 * inline editor (brackets Quick Edit feature support)
 * symbol navigation in current file (only function list, Quick Find Definition brackets feature)
 * jump to function definition.

Those features is a little bit crappy, because function match use regexp
and CodeMirror's token parser. `struct` and `class` members is not supported
at this time, will be supported eventually, and this is last ability of current
implementation.

When Autocomplete story is finished, I will add proper symbol location routines
using libclang, with current implementation as fast fallback.

Many other things fixes:

 * Serial port auto speed selection (not complete, see [full story]())
 * Serial port device name display
 * Error text selection in log
 * Vector board images (still useless, but have ports information)
 * cuwire API now is a separate project and used as a submodule

Enjoy!
