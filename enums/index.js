'use strict';

module.exports = {
  OBJECTS: {
    '0.10.x': [
      'cluster',
      'apis',
      'consumers',
      'plugins',
      'certificates',
      'snis',
      'upstreams'
    ],
    '0.11.x': [
      'apis',
      'consumers',
      'plugins',
      'certificates',
      'snis',
      'upstreams'
    ],
    '0.13.x': [
      'services',
      'routes',
      'apis',
      'consumers',
      'plugins',
      'certificates',
      'snis',
      'upstreams'
    ],
    '0.14.x': [
      'services',
      'routes',
      'consumers',
      'plugins',
      'certificates',
      'snis',
      'upstreams'
    ],
    '0.33.x': [
      'services',
      'routes',
      'apis',
      'consumers',
      'plugins',
      'certificates',
      'snis',
      'upstreams',
      'jwts',
      'key-auths',
      'acls'
    ]
  },
  IDENTIFIRES: {
    cluster: 'name',
    apis: 'name',
    consumers: 'id',
    plugins: 'id',
    certificates: 'id',
    snis: 'name',
    upstreams: 'id',
    targets: 'id',
    services: 'id',
    routes: 'id',
    jwts: 'id',
    acls: 'id',
    key_auths: 'id'
  },
  REQUEST_TIMEOUT: 1500
};
