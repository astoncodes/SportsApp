import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useReduceTransparency } from '../../lib/accessibility';
import { radius as radii, useIsDark, usePalette } from '../../theme';

/**
 * The one place this app decides how a translucent surface is drawn.
 *
 * Three tiers, chosen at runtime:
 *
 *   1. iOS 26+       native Liquid Glass (expo-glass-effect)
 *   2. blur-capable  expo-blur / CSS backdrop-blur with a tinted fill
 *   3. everything else, or Reduce Transparency on → an opaque surface
 *
 * Tier 3 is not a degraded experience, it is a supported one. The layout,
 * contrast and hit targets are identical; only the material changes.
 *
 * Keeping the platform checks here rather than in screens is the point. A
 * check scattered across ten components is ten places to forget Reduce
 * Transparency, and the people who enable that setting are exactly the ones
 * who cannot read text floating over a blurred map.
 */

export type GlassTier = 'liquid-glass' | 'blur' | 'opaque';

// Evaluated once at module load: a device does not gain Liquid Glass support
// mid-session, and calling into native on every render would be wasteful.
const nativeGlassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable();

// react-native-web maps BlurView onto backdrop-filter. Safari and Chrome
// support it; older browsers fall through to the opaque tier, which is why
// this is a capability check rather than a browser sniff.
const blurAvailable =
  Platform.OS === 'ios' ||
  Platform.OS === 'android' ||
  (Platform.OS === 'web' &&
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') ||
      CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));

export function resolveGlassTier(reduceTransparency: boolean): GlassTier {
  if (reduceTransparency) return 'opaque';
  if (nativeGlassAvailable) return 'liquid-glass';
  if (blurAvailable) return 'blur';
  return 'opaque';
}

export type AdaptiveGlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius. Passed to the native glass view so it clips correctly. */
  borderRadius?: number;
  /** `regular` for chrome over content, `clear` for lighter overlays. */
  glassStyle?: 'regular' | 'clear';
  /** Draw a hairline edge. Off for surfaces that sit flush against a screen edge. */
  bordered?: boolean;
};

export function AdaptiveGlassSurface({
  children,
  style,
  borderRadius = radii.lg,
  glassStyle = 'regular',
  bordered = true,
}: AdaptiveGlassSurfaceProps) {
  const colors = usePalette();
  const isDark = useIsDark();
  const reduceTransparency = useReduceTransparency();
  const tier = resolveGlassTier(reduceTransparency);

  const shape: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    ...(bordered ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder } : {}),
  };

  if (tier === 'liquid-glass') {
    return (
      <GlassView
        style={[shape, style]}
        glassEffectStyle={glassStyle}
        // Native glass adapts to whatever sits behind it; telling it the
        // current scheme keeps our text contrast predictable over a map that
        // may be much lighter or darker than the surface itself.
        tintColor={isDark ? 'rgba(19,37,32,0.35)' : 'rgba(255,255,255,0.35)'}
      >
        {children}
      </GlassView>
    );
  }

  if (tier === 'blur') {
    return (
      <BlurView
        intensity={glassStyle === 'clear' ? 24 : 44}
        tint={isDark ? 'dark' : 'light'}
        style={[shape, style]}
      >
        {/* A tint over the blur. Pure blur alone leaves text unreadable when
            the content behind it is high-contrast, which a map always is. */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
        {children}
      </BlurView>
    );
  }

  return <View style={[shape, { backgroundColor: colors.glassOpaque }, style]}>{children}</View>;
}
