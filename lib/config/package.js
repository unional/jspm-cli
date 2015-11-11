/*
 *   Copyright 2014-2015 Guy Bedford (http://guybedford.com)
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 */
var ConfigFile = require('./config-file');
var path = require('path');
var Promise = require('rsvp').Promise;
var ui = require('../ui');
var processDeps = require('../common').processDeps;
var hasProperties = require('../common').hasProperties;

/*
 * Package.json Configuration Class
 *
 * Public Properties
 * - packages
 * - baseURL
 * - lib
 * - dist
 * - configFile
 * - dependencies
 * - peerDependencies
 * - devDependencies
 * - overrides
 *
 * Public Methods
 * - write
 * - prompt
 *
 */
module.exports = PackageConfig;
function PackageConfig(fileName) {
  this.file = new ConfigFile(fileName, [
    'name',
    ['directories', [
      'baseURL',
      'packages',
      'lib',
      'dist'
    ]],
    'configFile',
    'configFiles',
    'registry',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'overrides',
    ['jspm', [
      'name',
      ['directories', [
        'baseURL',
        'packages',
        'lib',
        'dist'
      ]],
      'configFile',
      'configFiles',
      'registry',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'overrides'
    ]]
  ]);

  this.dir = path.dirname(path.resolve(fileName));


  this.jspmPrefix = this.file.has(['jspm']);
  this.jspmAware = this.jspmPrefix || this.file.has(['registry']);

  // jspm: true is allowed
  try {
    if (this.file.getValue(['jspm']))
      this.jspmPrefix = false;
  }
  catch(e) {}

  if (!this.jspmAware)
    this.file.setObject(['jspm'], {});

  var baseURLValue = prefixedGetValue.call(this, ['directories', 'baseURL']) || '';
  if (baseURLValue[0] == '/' || baseURLValue.indexOf('//') != -1 || baseURLValue.indexOf('\\\\') != -1 || baseURLValue.indexOf(':') != -1) {
    ui.log('warn', 'Server baseURL should be a relative file path. Reverting to current project folder.');
    baseURLValue = '';
  }
  
  this.baseURL = path.resolve(this.dir, baseURLValue);

  var packagesValue = prefixedGetValue.call(this, ['directories', 'packages']);
  this.packages = packagesValue ? path.resolve(this.dir, packagesValue) : path.resolve(this.baseURL, 'jspm_packages');

  if (path.relative(this.baseURL, this.packages)[0] == '.')
    ui.log('warn', '%jspm_packages% must be specified in the package.json within the baseURL for paths to resolve correctly.');

  var configFileValue = prefixedGetValue.call(this, ['configFiles', 'jspm']) || prefixedGetValue.call(this, ['configFile']);
  this.configFiles = {};
  this.configFiles.jspm = configFileValue ? path.resolve(this.dir, configFileValue) : path.resolve(this.baseURL, 'jspm.js');

  this.overrides = prefixedGetObject.call(this, ['overrides'], true) || {};

  var depsBase = [];
  if (this.file.has(['jspm', 'dependencies']) || 
      this.file.has(['jspm', 'peerDependencies']) || 
      this.file.has(['jspm', 'devDependencies']))
    depsBase.push('jspm');

  var registry = prefixedGetValue.call(this, ['registry']);

  // only read dependences if package.json is "jspm aware"
  if (this.jspmAware) {
    this.dependencies = processDeps(this.file.getObject(depsBase.concat(['dependencies'])), registry);
    this.peerDependencies = processDeps(this.file.getObject(depsBase.concat(['peerDependencies'])), registry);
    this.devDependencies = processDeps(this.file.getObject(depsBase.concat(['devDependencies'])), registry);
  }
  else {
    this.dependencies = {};
    this.peerDependencies = {};
    this.devDependencies = {};
  }
}

PackageConfig.prototype.write = function() {
  // sync public properties with underlying file representation
  var depsBase = [];
  if (this.file.has(['jspm', 'dependencies']) || 
      this.file.has(['jspm', 'peerDependencies']) || 
      this.file.has(['jspm', 'devDependencies']))
    depsBase.push('jspm');

  var registry = prefixedGetValue.call(this, ['registry']);
  function writeDependencies(dependencies) {
    var outDependencies = {};

    Object.keys(dependencies).forEach(function(depName) {
      var dep = dependencies[depName];

      if (!dep)
        return;

      var depValue;

      if (dep.registry == registry) {
        if (depName == dep.package)
          depValue = dep.version || '*';
        else
          depValue = dep.exactPackage;
      }
      else {
        depValue = dep.exactName;
      }

      outDependencies[depName] = depValue;
    });

    return outDependencies;
  }

  if (hasProperties(this.dependencies))
    this.file.setObject(depsBase.concat('dependencies'), writeDependencies(this.dependencies));
  this.file.setObject(depsBase.concat('peerDependencies'), writeDependencies(this.peerDependencies), true);
  this.file.setObject(depsBase.concat('devDependencies'), writeDependencies(this.devDependencies), true);

  prefixedSetObject.call(this, ['overrides'], this.overrides, true);

  var baseURL = toRelativePath.call(this, this.baseURL);

  prefixedSetValue.call(this, ['directories', 'baseURL'], baseURL || '.', '.');
  prefixedSetValue.call(this, ['directories', 'packages'], toRelativePath.call(this, this.packages), baseURL + (baseURL ? '/' : '') + 'jspm_packages');
  prefixedSetValue.call(this, ['configFiles', 'jspm'], toRelativePath.call(this, this.configFiles.jspm), baseURL + (baseURL ? '/' : '') + 'jspm.js');

  return this.file.write();
};

function prefixedSetObject(memberArray, object, clearIfEmpty) {
  var prefixed = ['jspm'].concat(memberArray);

  if (this.file.has(prefixed))
    this.file.setObject(prefixed, object, clearIfEmpty);
  else if (this.file.has(memberArray))
    this.file.setObject(memberArray, object, clearIfEmpty);
  else if (this.jspmPrefix)
    this.file.setObject(prefixed, object, clearIfEmpty);
  else
    this.file.setObject(memberArray, object, clearIfEmpty);
}

function prefixedSetValue(memberArray, value, defaultValue) {
  var prefixed = ['jspm'].concat(memberArray);

  // if already specified, continue to specify
  if (this.file.has(prefixed))
    this.file.setValue(prefixed, value);
  else if (this.file.has(memberArray))
    this.file.setValue(memberArray, value);

  // otherwise only specify if not default
  else if (this.jspmPrefix && value !== defaultValue)
    this.file.setValue(prefixed, value);
  else if (value !== defaultValue)
    this.file.setValue(memberArray, value);
}

function prefixedGetValue(memberArray) {
  return this.file.getValue(memberArray) || this.jspmPrefix && this.file.getValue(['jspm'].concat(memberArray));
}

function prefixedGetObject(memberArray, nested) {
  return this.file.getObject(memberArray, nested) || this.jspmPrefix && this.file.getObject(['jspm'].concat(memberArray), nested);
}

function toRelativePath(absPath) {
  return path.relative(this.dir, absPath).replace(/\\/g, '/');
}

// NB finish this
PackageConfig.prototype.prompt = function(promptType) {
  var baseDir = path.dirname(this.file.fileName);
  var base;

  var self = this;

  self.directories = self.directories || {};

  var pjsonPath = path.relative(baseDir, this.file.fileName);

  return Promise.resolve()
  .then(function() {
    return ui.input('%' + pjsonPath + ' directories.baseURL%', self.directories.baseURL || './', {
      info: 'Enter the baseURL public folder path.\n\nThis is the low-level public folder which is served to the browser containing all jspm modules.'
    });
  })
  .then(function(baseURL) {
    base = path.relative(process.cwd(), path.resolve(baseURL));
    baseURL = path.relative(baseDir, path.resolve(baseURL));
    if (!base)
      base = '.';
    base += path.sep;
    if (baseURL)
      self.directories.baseURL = baseURL;

    // directories.lib and directories.src are synonymous

    // NB list folders in baseURL, suggesting `dist`, `lib`, `src` and `app` if found, in that order (including directories.src as a guess)
    // if we are referencing right now in the config file the dist, then we should prompt the dist
    // if we have a lib and a dist, then prompt both (dist normally only gets prompted on compile)
    return ui.input('%' + pjsonPath + ' directories.lib%', self.directories.lib || (base + 'lib'), {
      info: 'Enter the path to the folder containing your local project code.\n\nThis folder is then used as the SystemJS package for all project-specific loader configuration.'
    })
    .then(function(lib) {
      self.directories.lib = lib;
    });
  })
  .then(function() {
    if (promptType != 'custom')
      return;

    return ui.input('%' + pjsonPath + ' directories.jspmPackages%', self.directories.packages || base + 'jspm_packages', {
      info: 'Enter the jspm packages folder.\n\nOnly necessary if you would like to customize this folder name or location (must be within directories.baseURL).'
    })
    .then(function(packages) {
      self.directories.packages = path.relative(baseDir, path.resolve(packages));
      return ui.input('%' + pjsonPath + ' configFiles.jspm%', self.configFiles.jspm && path.relative(base, self.configFiles.jspm) || base + 'config.js', {
        info: 'Enter a custom config file path.\n\nOnly necessary if you would like to customize the config file name or location.'
      });
    })
    .then(function(configFile) {
      self.configFiles.jspm = path.relative(baseDir, path.resolve(configFile));
    });
  });
};