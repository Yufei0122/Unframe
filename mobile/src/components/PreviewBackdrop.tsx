import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

export type PreviewBackdropProps = { id: string; image: ImageSourcePropType; cityImages: ImageSourcePropType[]; adjacentImage: ImageSourcePropType | null; drag: number; direction: number; reducedMotion: boolean; fade: Animated.Value };
export function PreviewBackdrop({ image, fade }: PreviewBackdropProps) {
  return <Animated.Image source={image} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: fade }]}/>;
}
