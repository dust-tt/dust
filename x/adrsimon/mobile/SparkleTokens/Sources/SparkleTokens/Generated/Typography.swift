// DO NOT EDIT — Generated from Sparkle (tailwind.config.js)
// Run: cd sparkle && node scripts/generate-swift.mjs


import SwiftUI

/// Font size definitions matching Sparkle's typography scale.
public enum SparkleFont {
    /// 12px / 16px line-height / normal tracking
    public static let xsSize: CGFloat = 12
    public static let xsLineHeight: CGFloat = 16
    public static let xsTracking: CGFloat = 0

    /// 14px / 20px line-height / -0.28px tracking
    public static let smSize: CGFloat = 14
    public static let smLineHeight: CGFloat = 20
    public static let smTracking: CGFloat = -0.28

    /// 16px / 24px line-height / -0.32px tracking
    public static let baseSize: CGFloat = 16
    public static let baseLineHeight: CGFloat = 24
    public static let baseTracking: CGFloat = -0.32

    /// 18px / 26px line-height / -0.36px tracking
    public static let lgSize: CGFloat = 18
    public static let lgLineHeight: CGFloat = 26
    public static let lgTracking: CGFloat = -0.36

    /// 20px / 28px line-height / -0.4px tracking
    public static let xlSize: CGFloat = 20
    public static let xlLineHeight: CGFloat = 28
    public static let xlTracking: CGFloat = -0.4

    /// 24px / 30px line-height / -0.96px tracking
    public static let _2xlSize: CGFloat = 24
    public static let _2xlLineHeight: CGFloat = 30
    public static let _2xlTracking: CGFloat = -0.96

    /// 32px / 36px line-height / -1.28px tracking
    public static let _3xlSize: CGFloat = 32
    public static let _3xlLineHeight: CGFloat = 36
    public static let _3xlTracking: CGFloat = -1.28

    /// 40px / 42px line-height / -2.4px tracking
    public static let _4xlSize: CGFloat = 40
    public static let _4xlLineHeight: CGFloat = 42
    public static let _4xlTracking: CGFloat = -2.4

    /// 48px / 52px line-height / -2.88px tracking
    public static let _5xlSize: CGFloat = 48
    public static let _5xlLineHeight: CGFloat = 52
    public static let _5xlTracking: CGFloat = -2.88

    /// 56px / 60px line-height / -3.36px tracking
    public static let _6xlSize: CGFloat = 56
    public static let _6xlLineHeight: CGFloat = 60
    public static let _6xlTracking: CGFloat = -3.36

    /// 64px / 68px line-height / -3.84px tracking
    public static let _7xlSize: CGFloat = 64
    public static let _7xlLineHeight: CGFloat = 68
    public static let _7xlTracking: CGFloat = -3.84

    /// 72px / 76px line-height / -4.32px tracking
    public static let _8xlSize: CGFloat = 72
    public static let _8xlLineHeight: CGFloat = 76
    public static let _8xlTracking: CGFloat = -4.32

    /// 80px / 84px line-height / -4.8px tracking
    public static let _9xlSize: CGFloat = 80
    public static let _9xlLineHeight: CGFloat = 84
    public static let _9xlTracking: CGFloat = -4.8

}

// MARK: - Text Style View Modifiers

public extension View {

    /// Sparkle text style: s-label-xs
    func sparkleLabelXs() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.xsTracking)
    }

    /// Sparkle text style: s-label-sm
    func sparkleLabelSm() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.smTracking)
    }

    /// Sparkle text style: s-label-base
    func sparkleLabelBase() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.baseTracking)
    }

    /// Sparkle text style: s-heading-xs
    func sparkleHeadingXs() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.xsTracking)
    }

    /// Sparkle text style: s-heading-sm
    func sparkleHeadingSm() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.smTracking)
    }

    /// Sparkle text style: s-heading-base
    func sparkleHeadingBase() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.baseTracking)
    }

    /// Sparkle text style: s-heading-lg
    func sparkleHeadingLg() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.lgSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.lgTracking)
    }

    /// Sparkle text style: s-heading-xl
    func sparkleHeadingXl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.xlSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont.xlTracking)
    }

    /// Sparkle text style: s-heading2xl
    func sparkleHeading2xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._2xlSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont._2xlTracking)
    }

    /// Sparkle text style: s-heading3xl
    func sparkleHeading3xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._3xlSize))
            .fontWeight(.semibold)
            .tracking(SparkleFont._3xlTracking)
    }

    /// Sparkle text style: s-heading4xl
    func sparkleHeading4xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._4xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._4xlTracking)
    }

    /// Sparkle text style: s-heading5xl
    func sparkleHeading5xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._5xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._5xlTracking)
    }

    /// Sparkle text style: s-heading6xl
    func sparkleHeading6xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._6xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._6xlTracking)
    }

    /// Sparkle text style: s-heading7xl
    func sparkleHeading7xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._7xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._7xlTracking)
    }

    /// Sparkle text style: s-heading8xl
    func sparkleHeading8xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._8xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._8xlTracking)
    }

    /// Sparkle text style: s-heading9xl
    func sparkleHeading9xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._9xlSize))
            .fontWeight(.medium)
            .tracking(SparkleFont._9xlTracking)
    }

    /// Sparkle text style: s-heading-mono-lg
    func sparkleHeadingMonoLg() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont.lgSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.lgTracking)
    }

    /// Sparkle text style: s-heading-mono-xl
    func sparkleHeadingMonoXl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont.xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.xlTracking)
    }

    /// Sparkle text style: s-heading-mono2xl
    func sparkleHeadingMono2xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._2xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._2xlTracking)
    }

    /// Sparkle text style: s-heading-mono3xl
    func sparkleHeadingMono3xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._3xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._3xlTracking)
    }

    /// Sparkle text style: s-heading-mono4xl
    func sparkleHeadingMono4xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._4xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._4xlTracking)
    }

    /// Sparkle text style: s-heading-mono5xl
    func sparkleHeadingMono5xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._5xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._5xlTracking)
    }

    /// Sparkle text style: s-heading-mono6xl
    func sparkleHeadingMono6xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._6xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._6xlTracking)
    }

    /// Sparkle text style: s-heading-mono7xl
    func sparkleHeadingMono7xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._7xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._7xlTracking)
    }

    /// Sparkle text style: s-heading-mono8xl
    func sparkleHeadingMono8xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._8xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._8xlTracking)
    }

    /// Sparkle text style: s-heading-mono9xl
    func sparkleHeadingMono9xl() -> some View {
        self
            .font(.custom("Geist Mono", size: SparkleFont._9xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._9xlTracking)
    }

    /// Sparkle text style: s-copy-xs
    func sparkleCopyXs() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.xsTracking)
    }

    /// Sparkle text style: s-copy-sm
    func sparkleCopySm() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.smTracking)
    }

    /// Sparkle text style: s-copy-base
    func sparkleCopyBase() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.baseTracking)
    }

    /// Sparkle text style: s-copy-lg
    func sparkleCopyLg() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.lgSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.lgTracking)
    }

    /// Sparkle text style: s-copy-xl
    func sparkleCopyXl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont.xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont.xlTracking)
    }

    /// Sparkle text style: s-copy2xl
    func sparkleCopy2xl() -> some View {
        self
            .font(.custom("Geist", size: SparkleFont._2xlSize))
            .fontWeight(.regular)
            .tracking(SparkleFont._2xlTracking)
    }

}
