// DO NOT EDIT — Generated from Sparkle (tailwind.config.js)
// Run: cd sparkle && node scripts/generate-swift.mjs


import SwiftUI

/// Font size definitions matching Sparkle's mobile typography scale.
public enum SparkleFont {
    /// xs: mobile 15px / 23px line-height / normal tracking
    public static let xsSize: CGFloat = 15
    public static let xsLineHeight: CGFloat = 23
    public static let xsTracking: CGFloat = 0

    /// sm: mobile 17px / 26px line-height / -0.34px tracking
    public static let smSize: CGFloat = 17
    public static let smLineHeight: CGFloat = 26
    public static let smTracking: CGFloat = -0.34

    /// base: mobile 19px / 29px line-height / -0.38px tracking
    public static let baseSize: CGFloat = 19
    public static let baseLineHeight: CGFloat = 29
    public static let baseTracking: CGFloat = -0.38

    /// lg: mobile 22px / 32px line-height / -0.44px tracking
    public static let lgSize: CGFloat = 22
    public static let lgLineHeight: CGFloat = 32
    public static let lgTracking: CGFloat = -0.44

    /// xl: mobile 24px / 36px line-height / -0.48px tracking
    public static let xlSize: CGFloat = 24
    public static let xlLineHeight: CGFloat = 36
    public static let xlTracking: CGFloat = -0.48

    /// 2xl: mobile 30px / 44px line-height / -1.2px tracking
    public static let _2xlSize: CGFloat = 30
    public static let _2xlLineHeight: CGFloat = 44
    public static let _2xlTracking: CGFloat = -1.2

    /// 3xl: mobile 39px / 50px line-height / -1.56px tracking
    public static let _3xlSize: CGFloat = 39
    public static let _3xlLineHeight: CGFloat = 50
    public static let _3xlTracking: CGFloat = -1.56

    /// 4xl: mobile 49px / 64px line-height / -2.94px tracking
    public static let _4xlSize: CGFloat = 49
    public static let _4xlLineHeight: CGFloat = 64
    public static let _4xlTracking: CGFloat = -2.94

    /// 5xl: mobile 59px / 77px line-height / -3.54px tracking
    public static let _5xlSize: CGFloat = 59
    public static let _5xlLineHeight: CGFloat = 77
    public static let _5xlTracking: CGFloat = -3.54

    /// 6xl: mobile 68px / 89px line-height / -4.08px tracking
    public static let _6xlSize: CGFloat = 68
    public static let _6xlLineHeight: CGFloat = 89
    public static let _6xlTracking: CGFloat = -4.08

    /// 7xl: mobile 78px / 102px line-height / -4.68px tracking
    public static let _7xlSize: CGFloat = 78
    public static let _7xlLineHeight: CGFloat = 102
    public static let _7xlTracking: CGFloat = -4.68

    /// 8xl: mobile 88px / 115px line-height / -5.28px tracking
    public static let _8xlSize: CGFloat = 88
    public static let _8xlLineHeight: CGFloat = 115
    public static let _8xlTracking: CGFloat = -5.28

    /// 9xl: mobile 98px / 128px line-height / -5.88px tracking
    public static let _9xlSize: CGFloat = 98
    public static let _9xlLineHeight: CGFloat = 128
    public static let _9xlTracking: CGFloat = -5.88

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
