#!/bin/bash

# Update system packages
sudo apt-get update

# Install required dependencies
sudo apt-get -y install \
  postgresql-14 \
  zlib1g-dev \
  libldap2-dev \
  libidn11-dev \
  libxml2-dev \
  libsqlite3-dev \
  libpq-dev \
  libyaml-dev \
  libxmlsec1-dev \
  curl \
  build-essential

# Verify PostgreSQL installation
psql --version

# Start PostgreSQL service
sudo service postgresql start

echo "Dependencies installed successfully!"
