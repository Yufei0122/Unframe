import React from 'react';
import { View } from 'react-native';
export type SwipeSceneProps = { children: React.ReactNode; onSwipe: (direction: number) => void; onDrag?: (offset: number) => void; onHold: (held: boolean) => void; onVisibility: (visible: boolean) => void };
export function SwipeScene({ children }: SwipeSceneProps) { return <View>{children}</View>; }
