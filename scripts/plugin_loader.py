@property
def plugins(self) -> typing.Iterable[PluginSpec]:
    yield from self._plugins.values()

def __len__(self):
    return len(self._plugins)