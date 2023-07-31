set -x
set -e

apt-get update
apt-get install -y cmake libboost-all-dev

# Install poppler
wget "https://poppler.freedesktop.org/poppler-23.07.0.tar.xz"
tar -xf poppler-23.07.0.tar.xz
cd poppler-23.07.0
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=release ..
make
make install
echo "Successfully installed poppler"
