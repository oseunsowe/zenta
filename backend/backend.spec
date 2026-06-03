# -*- mode: python ; coding: utf-8 -*-
# Pyinstaller spec for the bundled backend executable.
# Build: pyinstaller backend.spec  (from inside backend/)

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = (
    collect_submodules('uvicorn')
    + collect_submodules('uvicorn.protocols')
    + collect_submodules('uvicorn.lifespan')
    + collect_submodules('uvicorn.loops')
    + collect_submodules('uvicorn.logging')
    + collect_submodules('app')
)

a = Analysis(
    ['serve.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'PIL'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name='backend-runner',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    onefile=True,
)
