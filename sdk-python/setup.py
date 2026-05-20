from setuptools import find_packages, setup

setup(
    name="pace-sdk",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["requests>=2.28.0"],
    extras_require={
        "flask": ["flask>=2.0"],
        "fastapi": ["fastapi>=0.95", "starlette>=0.27"],
    },
    python_requires=">=3.8",
    description="Rate limiting SDK with cloud observability",
    license="MIT",
)
from setuptools import setup, Extension
import pybind11
import os

# Get the absolute path of the directory where setup.py is located
base_path = os.path.dirname(os.path.abspath(__file__))
# Calculate the absolute path to the engine directory
engine_path = os.path.abspath(os.path.join(base_path, "..", "..", "engine"))

ext_modules = [
    Extension(
        'pace_native',
        [
            os.path.join(base_path, 'src', 'pace_python.cpp'),
            os.path.join(engine_path, 'src', 'pace_sdk.cpp'),
            os.path.join(engine_path, 'src', 'cache.cpp'),
            os.path.join(engine_path, 'src', 'token_bucket.cpp'),
            os.path.join(engine_path, 'src', 'sliding_window.cpp')
        ],
        include_dirs=[
            pybind11.get_include(),
            os.path.join(engine_path, 'include')
        ],
        language='c++',
        extra_compile_args=['-std=c++17', '-O3']
    ),
]

setup(
    name='pace',
    version='0.1.0',
    ext_modules=ext_modules,
)