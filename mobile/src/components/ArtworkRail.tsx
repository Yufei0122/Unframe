import React from 'react';
import { ScrollView } from 'react-native';

export function ArtworkRail({ children }: { children: React.ReactNode }) {
  return <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 18, paddingBottom: 5 }} decelerationRate="fast" snapToInterval={166}>{children}</ScrollView>;
}
