import React from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';
import { c } from '../ui';

const logo = require('../../assets/brand/unframe-logo.png');
const mark = require('../../assets/brand/unframe-mark.png');
type BrandTone = 'default' | 'inverse';

function BrandImage({ source, label, width, height, tone }: { source: ImageSourcePropType; label: string; width: number; height: number; tone: BrandTone }) {
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}><Image source={source} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" resizeMode="contain" style={{ width, height, ...(tone === 'inverse' && { tintColor: c.bg }) }}/></View>;
}

export function BrandLogo({ width = 156, tone = 'default' }: { width?: number; tone?: BrandTone }) {
  return <BrandImage source={logo} label="Unframe" width={width} height={width * 402 / 1879} tone={tone}/>;
}

export function BrandMark({ size = 32, tone = 'default' }: { size?: number; tone?: BrandTone }) {
  return <BrandImage source={mark} label="Unframe mark" width={size} height={size} tone={tone}/>;
}
