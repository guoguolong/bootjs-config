"use strict";

const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

/**
 *  
 *  @param options = {
 *     excludeFiles: [排除的文件列表] // 暂未实现.
 *     env: "<环境变量标识>" // 传入，则不再检查NODE_ENV和env.js文件.
 *     preConfig: 预加载的config对象.
 *  }
 *
 */
module.exports = function(configBaseDir, options) {
    function loadConfig(filePath, config, options) {
        let moduleConfig = require(filePath);
        if (_.isFunction(moduleConfig)) {
            moduleConfig = moduleConfig(config, options);
        }
        moduleConfig.params = {}; // params是内置节点，使用无效.
        _.merge(config, moduleConfig);
        return config;
    }

    function loadConfigs(config, baseDir, excludeFile) {
        if (fs.existsSync(baseDir)) {
            let dir = fs.readdirSync(baseDir);
            dir.forEach(function(item) { // 加载扩展名为.js的文件.
                let itemPath = path.resolve(baseDir, item);
                let stats = fs.statSync(itemPath);
                if (stats.isFile() && item.match(/\.js$/)) {
                    if (excludeFile && item == excludeFile) {
                        return;
                    }
                    loadConfig(itemPath, config, options);
                }
            });
        }
        return config;
    }

    function loadYamls(config, baseDir) {
        if (fs.existsSync(baseDir)) {
            let dir = fs.readdirSync(baseDir);
            dir.forEach(function(item) { // 加载扩展名为.js的文件.
                let yamlPath = path.resolve(baseDir, item);
                let stats = fs.statSync(yamlPath);
                if (stats.isFile() && item.match(/\.yml$|yaml$/)) {
                    let yamlConfig = yaml.safeLoad(fs.readFileSync(yamlPath, 'utf8'));
                    _.merge(config, yamlConfig);
                }
            });
        }
        return config;
    }

    options = options || {};
    let config = options.preConfig && options.preConfig || {};
    config.env = options.env || config.env;
    config.params = config.params || {};

    // 1. 正规化config.env节点.
    let configEnvBaseDir = path.join(configBaseDir, 'env/');
    if (!config.env) {
        let configEnvJs = path.join(configEnvBaseDir, 'env.js');
        if (process.env['NODE_ENV']) {
            config.env = process.env['NODE_ENV'];
        } else {
            if (fs.existsSync(configEnvJs)) {
                _.merge(config, require(configEnvJs));
            }
        }
    }
    let configEnvDir = config.env && path.join(configEnvBaseDir, config.env);

    // 2. 加载参数配置文件，合并到config.params
    let yamlConfig = loadYamls({}, configBaseDir); // 遍历配置目录并加载 参数配置yaml文件 
    if (configEnvDir) yamlConfig = loadYamls(yamlConfig, configEnvDir);
    config.params = _.merge(yamlConfig, config.params);

    // 3. 加载配置目录、autoloadings、环境配置目录下所有配置文件
    config = loadConfigs(config, configBaseDir);
    config = loadConfigs(config, path.join(configBaseDir, 'autoloadings/'));
    if (configEnvDir) {
        config = loadConfigs(config, configEnvDir);
        config = loadConfigs(config, path.join(configEnvDir, 'autoloadings/'));
    }
    config.loadPlugins = function(app, options) {
        options = options || {};

        app.addPlugin = function(name, value) {
            let plugins = this.getPlugin();
            plugins[name] = value;
            app.set('plugins', plugins);
        };

        app.getPlugin = function(name) {
            let plugins = app.get('plugins');
            if (!plugins) {
                app.set('plugins', {});
            }
            plugins = app.get('plugins');
            if (name) {
                return plugins[name];
            }
            return plugins;
        };

        this.plugins = this.plugins || {};
        for (let pluginKey in this.plugins) {
            let pluginConf = this.plugins[pluginKey];
            pluginConf.env = this.env;
            pluginConf.name = pluginConf.name || pluginKey;
            try {
                let modulePath = pluginConf.moduleName;
                if (pluginConf.localModuleBaseDir) modulePath = path.join(pluginConf.localModuleBaseDir, modulePath);
                let pluginObj = require(modulePath)(app, pluginConf);
                app.addPlugin(pluginConf.name, pluginObj);
                pluginObj.init(this, options);
            } catch (e) {
                console.error(e);
            }
        }
    }
    return config;
}