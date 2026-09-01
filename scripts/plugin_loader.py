"""
FLAGGED FOR DELETION -- orphaned fragment, not a real module.

Five lines: a bare `@property` and `__len__` referencing `self._plugins`
and `PluginSpec`, neither defined nor imported anywhere in this file, with
no enclosing class. Not valid as a standalone module -- these statements
are not part of a class body, so `self` and `@property` don't do anything
meaningful here.

This is NOT the PluginLoader that apps/extractors/ileapp_bridge's vendored
iLEAPP actually uses -- ileapp.py imports `scripts.plugin_loader` from
*inside the iLEAPP submodule* (apps/extractors/ileapp_bridge/iLEAPP/scripts/
plugin_loader.py, via sys.path manipulation -- see
diagnose_ileapp_plugin_loading.py), a completely different file that just
happens to share this path suffix. The submodule isn't checked out in
every clone, so that file may not even be present locally; either way it
is not this one.

Nothing in this repo imports this file (confirmed: no other file
references `scripts.plugin_loader` or `plugin_loader` resolving to this
path). Likely an accidental partial paste.

Recommend: delete.
"""
