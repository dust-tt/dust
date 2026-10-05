// DO NOT EDIT — Generated from Sparkle (sparkle/src/styles, sparkle/src/icons, sparkle/src/logo)
// Run: make tokens


import SwiftUI

public enum SparkleFont {
    public static let xsSize: CGFloat = 15
    public static let xsLineHeight: CGFloat = 20
    public static let xsTracking: CGFloat = 0

    public static let smSize: CGFloat = 17
    public static let smLineHeight: CGFloat = 24
    public static let smTracking: CGFloat = 0

    public static let baseSize: CGFloat = 19
    public static let baseLineHeight: CGFloat = 29
    public static let baseTracking: CGFloat = 0

    public static let lgSize: CGFloat = 22
    public static let lgLineHeight: CGFloat = 32
    public static let lgTracking: CGFloat = -0.22

    public static let xlSize: CGFloat = 24
    public static let xlLineHeight: CGFloat = 34
    public static let xlTracking: CGFloat = -0.36

    public static let _2xlSize: CGFloat = 29
    public static let _2xlLineHeight: CGFloat = 39
    public static let _2xlTracking: CGFloat = -0.435

    public static let _3xlSize: CGFloat = 39
    public static let _3xlLineHeight: CGFloat = 49
    public static let _3xlTracking: CGFloat = -0.78

    public static let _4xlSize: CGFloat = 48
    public static let _4xlLineHeight: CGFloat = 53
    public static let _4xlTracking: CGFloat = -1.2

    public static let _5xlSize: CGFloat = 58
    public static let _5xlLineHeight: CGFloat = 68
    public static let _5xlTracking: CGFloat = -1.682

    public static let _6xlSize: CGFloat = 68
    public static let _6xlLineHeight: CGFloat = 75
    public static let _6xlTracking: CGFloat = -2.21

    public static let _7xlSize: CGFloat = 77
    public static let _7xlLineHeight: CGFloat = 82
    public static let _7xlTracking: CGFloat = -2.772

    public static let _8xlSize: CGFloat = 87
    public static let _8xlLineHeight: CGFloat = 92
    public static let _8xlTracking: CGFloat = -3.48

    public static let _9xlSize: CGFloat = 97
    public static let _9xlLineHeight: CGFloat = 102
    public static let _9xlTracking: CGFloat = -3.88

}

public extension View {

    func sparkleLabelXs() -> some View {
        font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.medium)
            .tracking(0)
    }

    func sparkleLabelSm() -> some View {
        font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.medium)
            .tracking(0)
    }

    func sparkleLabelBase() -> some View {
        font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.medium)
            .tracking(0)
    }

    func sparkleHeadingXs() -> some View {
        font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.semibold)
            .tracking(0)
    }

    func sparkleHeadingSm() -> some View {
        font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.semibold)
            .tracking(0)
    }

    func sparkleHeadingBase() -> some View {
        font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.semibold)
            .tracking(-0.095)
    }

    func sparkleHeadingLg() -> some View {
        font(.custom("Geist", size: SparkleFont.lgSize))
            .fontWeight(.semibold)
            .tracking(-0.22)
    }

    func sparkleHeadingXl() -> some View {
        font(.custom("Geist", size: SparkleFont.xlSize))
            .fontWeight(.semibold)
            .tracking(-0.36)
    }

    func sparkleHeading2xl() -> some View {
        font(.custom("Geist", size: SparkleFont._2xlSize))
            .fontWeight(.semibold)
            .tracking(-0.435)
    }

    func sparkleHeading3xl() -> some View {
        font(.custom("Geist", size: SparkleFont._3xlSize))
            .fontWeight(.semibold)
            .tracking(-0.78)
    }

    func sparkleHeading4xl() -> some View {
        font(.custom("Geist", size: SparkleFont._4xlSize))
            .fontWeight(.medium)
            .tracking(-1.2)
    }

    func sparkleHeading5xl() -> some View {
        font(.custom("Geist", size: SparkleFont._5xlSize))
            .fontWeight(.medium)
            .tracking(-1.682)
    }

    func sparkleHeading6xl() -> some View {
        font(.custom("Geist", size: SparkleFont._6xlSize))
            .fontWeight(.medium)
            .tracking(-2.21)
    }

    func sparkleHeading7xl() -> some View {
        font(.custom("Geist", size: SparkleFont._7xlSize))
            .fontWeight(.medium)
            .tracking(-2.772)
    }

    func sparkleHeading8xl() -> some View {
        font(.custom("Geist", size: SparkleFont._8xlSize))
            .fontWeight(.medium)
            .tracking(-3.48)
    }

    func sparkleHeading9xl() -> some View {
        font(.custom("Geist", size: SparkleFont._9xlSize))
            .fontWeight(.medium)
            .tracking(-3.88)
    }

    func sparkleHeadingMonoLg() -> some View {
        font(.custom("Geist Mono", size: SparkleFont.lgSize))
            .fontWeight(.regular)
            .tracking(-0.22)
    }

    func sparkleHeadingMonoXl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont.xlSize))
            .fontWeight(.regular)
            .tracking(-0.36)
    }

    func sparkleHeadingMono2xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._2xlSize))
            .fontWeight(.regular)
            .tracking(-0.435)
    }

    func sparkleHeadingMono3xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._3xlSize))
            .fontWeight(.regular)
            .tracking(-0.78)
    }

    func sparkleHeadingMono4xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._4xlSize))
            .fontWeight(.regular)
            .tracking(-1.2)
    }

    func sparkleHeadingMono5xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._5xlSize))
            .fontWeight(.regular)
            .tracking(-1.682)
    }

    func sparkleHeadingMono6xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._6xlSize))
            .fontWeight(.regular)
            .tracking(-2.21)
    }

    func sparkleHeadingMono7xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._7xlSize))
            .fontWeight(.regular)
            .tracking(-2.772)
    }

    func sparkleHeadingMono8xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._8xlSize))
            .fontWeight(.regular)
            .tracking(-3.48)
    }

    func sparkleHeadingMono9xl() -> some View {
        font(.custom("Geist Mono", size: SparkleFont._9xlSize))
            .fontWeight(.regular)
            .tracking(-3.88)
    }

    func sparkleCopyXs() -> some View {
        font(.custom("Geist", size: SparkleFont.xsSize))
            .fontWeight(.regular)
            .tracking(0)
    }

    func sparkleCopySm() -> some View {
        font(.custom("Geist", size: SparkleFont.smSize))
            .fontWeight(.regular)
            .tracking(0)
    }

    func sparkleCopyBase() -> some View {
        font(.custom("Geist", size: SparkleFont.baseSize))
            .fontWeight(.regular)
            .tracking(0)
    }

    func sparkleCopyLg() -> some View {
        font(.custom("Geist", size: SparkleFont.lgSize))
            .fontWeight(.regular)
            .tracking(0)
    }

    func sparkleCopyXl() -> some View {
        font(.custom("Geist", size: SparkleFont.xlSize))
            .fontWeight(.regular)
            .tracking(0)
    }

    func sparkleCopy2xl() -> some View {
        font(.custom("Geist", size: SparkleFont._2xlSize))
            .fontWeight(.regular)
            .tracking(0)
    }
}
