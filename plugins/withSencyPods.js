// Lets CocoaPods find and link Sency's iPhone SDK (Advanced MSK Health,
// src/modules/msk). The Android side needs no plugin of its own: the Maven
// repository and the shrinker rules are set with expo-build-properties in
// app.config.js.
//
// Sency publishes SMKitUI, SMKit and SMBase in its own CocoaPods spec repo, not
// in the public one, so the generated Podfile has to name both sources. Naming
// any source turns the default off, so the public one (the CDN) is named too.
//
// Sency's frameworks are dynamic, and this app links its pods statically
// (no use_frameworks!). Their setup notes for that case
// (smkit-ui-react-native-demo, docs/ios-setup.md, "Known issues") say to build
// their pods as dynamic frameworks and with library distribution on. That is
// the pre_install and post_install part below.
//
// Their notes also turn off the arm64 simulator build for those pods. That is
// left out: it only matters on a simulator, and this app's other libraries
// need arm64 there.

const { withPodfile } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const SOURCES = [
  `source 'https://bitbucket.org/sencyai/ios_sdks_release.git'`,
  `source 'https://cdn.cocoapods.org/'`,
].join('\n');

const PRE_INSTALL = [
  `$sency_dynamic_frameworks = ['SMKitUI', 'SMKit', 'SMBase', 'SwiftyJSON', 'SMBaseUI']`,
  ``,
  `pre_install do |installer|`,
  `  installer.pod_targets.each do |pod|`,
  `    next unless $sency_dynamic_frameworks.include?(pod.name)`,
  `    def pod.build_type`,
  `      Pod::BuildType.dynamic_framework`,
  `    end`,
  `  end`,
  `end`,
].join('\n');

const POST_INSTALL = [
  `    installer.pods_project.targets.each do |target|`,
  `      next unless $sency_dynamic_frameworks.include?(target.name)`,
  `      target.build_configurations.each do |build_configuration|`,
  `        build_configuration.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'`,
  `      end`,
  `    end`,
].join('\n');

module.exports = function withSencyPods(config) {
  return withPodfile(config, (cfg) => {
    let src = cfg.modResults.contents;
    // Above everything else in the Podfile.
    src = mergeContents({
      tag: 'embracehealthai-sency-sources',
      src,
      newSrc: SOURCES,
      anchor: /^/,
      offset: 0,
      comment: '#',
    }).contents;
    // Just before the app's target.
    src = mergeContents({
      tag: 'embracehealthai-sency-pre-install',
      src,
      newSrc: PRE_INSTALL,
      anchor: /^target ['"]/m,
      offset: 0,
      comment: '#',
    }).contents;
    // First thing inside the existing post_install.
    src = mergeContents({
      tag: 'embracehealthai-sency-post-install',
      src,
      newSrc: POST_INSTALL,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: '#',
    }).contents;
    cfg.modResults.contents = src;
    return cfg;
  });
};
