'use strict';

const rp = require('request-promise');
const semver = require('semver');
const ENUMS = require('../enums');
const KONG_VERSION_MAP = {
  '0.33.0': ENUMS.OBJECTS['0.33.x'],
  '0.14.0': ENUMS.OBJECTS['0.14.x'],
  '0.13.0': ENUMS.OBJECTS['0.13.x'],
  '0.11.0': ENUMS.OBJECTS['0.11.x']
}

module.exports = function getObjects(url) {
  return rp(url).then(body => {
    const res = JSON.parse(body);
    let version = res.version;


    // workaround kong-enterprise-edition semver format issue
    const eeIndex = version.indexOf('-enterprise-edition');
    if ( eeIndex > 0) {
      version = version.substr(0, eeIndex);
      version += '.0'
    }

    for (let key of Object.keys(KONG_VERSION_MAP))
    {
      if (semver.gte(version, key)) {
        return KONG_VERSION_MAP[key];
      }
    }

    return undefined;
  });
};
