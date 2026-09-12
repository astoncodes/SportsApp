import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { space, sportColor, usePalette } from '../../theme';
import { AppText, sportIcon } from './primitives';

export function BrandMark({
  size = 32,
  showTagline = false,
  inverse = false,
}: {
  size?: number;
  showTagline?: boolean;
  inverse?: boolean;
}) {
  const colors = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{ width: size, height: size * 1.2, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            position: 'absolute',
            top: 2,
            width: size * 0.88,
            height: size * 0.88,
            borderRadius: size / 2,
            borderBottomRightRadius: 5,
            transform: [{ rotate: '45deg' }],
            backgroundColor: inverse ? '#FFFFFF' : colors.live,
          }}
        />
        <MaterialCommunityIcons
          name="basketball"
          size={size * 0.59}
          color={inverse ? '#00865C' : '#FFFFFF'}
          style={{ marginBottom: size * 0.22 }}
        />
      </View>
      <View>
        <AppText
          style={{
            fontSize: size * 0.8,
            lineHeight: size,
            fontWeight: '800',
            letterSpacing: -1.1,
            color: inverse ? '#FFFFFF' : colors.text,
          }}
        >
          Drop In
          <AppText style={{ color: inverse ? '#7BE9B6' : colors.live, fontSize: size * 0.8 }}>
            .
          </AppText>
        </AppText>
        {showTagline && (
          <AppText variant="caption" style={{ color: inverse ? '#CDDFD6' : colors.textMuted }}>
            Find a game. Meet your people.
          </AppText>
        )}
      </View>
    </View>
  );
}

export function SportBadge({ slug, size = 44 }: { slug?: string | null; size?: number }) {
  const color = sportColor(slug);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        backgroundColor: `${color}16`,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <MaterialCommunityIcons
        name={slug ? sportIcon(slug) : 'map-marker-outline'}
        size={size * 0.53}
        color={color}
      />
    </View>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="heading">{title}</AppText>
        {subtitle && (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      {action}
    </View>
  );
}
