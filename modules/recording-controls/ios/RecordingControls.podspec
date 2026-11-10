Pod::Spec.new do |s|
  s.name           = 'RecordingControls'
  s.version        = '1.0.0'
  s.summary        = 'Native recording controls for Daytale.'
  s.description    = 'iOS Live Activity controls and the App Group recording intent queue.'
  s.homepage       = 'https://daytale.app'
  s.license        = { :type => 'MIT' }
  s.author         = 'Daytale'
  s.platforms      = { :ios => '17.0' }
  s.source         = { :git => 'https://github.com/daytale/daytale.git' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  # The shared files live outside the module. From modules/recording-controls/ios/ the repo
  # targets/_shared directory is three levels up.
  s.source_files = "**/*.{h,m,swift}",
                   "../../../targets/_shared/RecordingActivityAttributes.swift",
                   "../../../targets/_shared/RecordingIntentQueue.swift"
end
