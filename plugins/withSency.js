// Native setup Sency's React Native package needs that Expo doesn't do by
// itself (README of @sency/react-native-smkit-ui 2.4.4, "Platform Setup"):
//   iOS      Sency's CocoaPods repo as a pod source (plus the public CDN,
//            which stops being the default once any source is listed), and
//            BUILD_LIBRARY_FOR_DISTRIBUTION on Sency's pods.
//   Android  Sency's Maven repository.
// use_frameworks comes from expo-build-properties in app.config.ts.

const { withPodfile, withProjectBuildGradle } = require('expo/config-plugins');

const POD_SOURCES = [
  "source 'https://bitbucket.org/sencyai/ios_sdks_release.git'",
  "source 'https://cdn.cocoapods.org/'",
];
const SENCY_POD = /^(SMBase|SMKit|SMKitUI|react-native-smkit-ui)$/;
const MAVEN_URL = 'https://artifacts.sency.ai/artifactory/release/';

const withSencyIos = (config) =>
  withPodfile(config, (cfg) => {
    let podfile = cfg.modResults.contents;
    if (!podfile.includes(POD_SOURCES[0])) {
      podfile = `${POD_SOURCES.join('\n')}\n\n${podfile}`;
    }
    if (!podfile.includes('# sency-build-settings')) {
      podfile = podfile.replace(
        /post_install do \|installer\|\n/,
        (m) =>
          `${m}    # sency-build-settings\n` +
          `    installer.pods_project.targets.each do |t|\n` +
          `      next unless t.name =~ ${SENCY_POD.toString()}\n` +
          `      t.build_configurations.each { |c| c.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES' }\n` +
          `    end\n`,
      );
    }
    cfg.modResults.contents = podfile;
    return cfg;
  });

const withSencyAndroid = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes(MAVEN_URL)) {
      gradle = gradle.replace(
        /allprojects\s*\{\s*\n\s*repositories\s*\{/,
        (m) => `${m}\n        maven { url '${MAVEN_URL}' }`,
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });

module.exports = (config) => withSencyAndroid(withSencyIos(config));
