// Lets react-native-nitro-media-kit (Runcam's clip export) compile for iPhone.
//
// The library uses a call that needs iOS 16 (AVAssetImageGenerator.image(at:)),
// but it asks to be built for React Native's minimum, iOS 15.1, so Xcode refuses:
//   'image(at:)' is only available in iOS 16 or newer
// The Companion itself needs iOS 16.4 (Expo SDK 58), so nothing is lost by
// building this one library for 16.4 too. That is all this does: it adds a few
// lines to the generated Podfile's post_install.
//
// Remove it when the library's own podspec asks for iOS 16 or newer.

const { withPodfile } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const POD = 'NitroMediaKit';
const IOS = '16.4';

const SNIPPET = [
  `    installer.pods_project.targets.each do |target|`,
  `      next unless target.name == '${POD}'`,
  `      target.build_configurations.each do |build_configuration|`,
  `        build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS}'`,
  `      end`,
  `    end`,
].join('\n');

module.exports = function withNitroMediaKitIos(config) {
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = mergeContents({
      tag: 'embracehealthai-nitro-media-kit-ios',
      src: cfg.modResults.contents,
      newSrc: SNIPPET,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: '#',
    }).contents;
    return cfg;
  });
};
