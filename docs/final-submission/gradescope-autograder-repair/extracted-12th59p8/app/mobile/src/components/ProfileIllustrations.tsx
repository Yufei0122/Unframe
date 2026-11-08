import React, { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// Temporary, bundled vector artwork. Replace these components when the final
// profile portrait, gallery photograph and annual-review artwork are available.
// No external image requests or visitor photographs are used.
export function GalleryIllustration() {
  const id = useId().replace(/:/g, '');
  return <Svg width="100%" height="100%" viewBox="0 0 420 240" preserveAspectRatio="xMidYMid slice" accessible={false}>
    <Defs>
      <LinearGradient id={`${id}-wall`} x1="0" y1="0" x2="1" y2="1"><Stop stopColor="#F7F3ED"/><Stop offset="1" stopColor="#E7D6BF"/></LinearGradient>
      <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><Stop stopColor="#DCEAF2"/><Stop offset=".68" stopColor="#F8F5EC"/><Stop offset="1" stopColor="#DBD8CB"/></LinearGradient>
      <LinearGradient id={`${id}-marble`} x1="0" y1="0" x2="1" y2=".8"><Stop stopColor="#FFFCF4"/><Stop offset=".46" stopColor="#F0E5D3"/><Stop offset="1" stopColor="#BCAB94"/></LinearGradient>
      <LinearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#F7F3EE"/><Stop offset=".45" stopColor="#F7F3EE" stopOpacity=".96"/><Stop offset=".76" stopColor="#F7F3EE" stopOpacity=".15"/><Stop offset="1" stopColor="#F7F3EE" stopOpacity="0"/></LinearGradient>
    </Defs>
    <Rect width="420" height="240" fill={`url(#${id}-wall)`}/>
    <Path d="M260 240V93Q257 29 315-18Q377 31 379 96V240" fill="#F9F0E1" stroke="#E5D1B1" strokeWidth="7"/>
    <Path d="M278 240V95Q278 42 316 10Q358 50 360 97V240" fill={`url(#${id}-sky)`}/>
    <Path d="M269 96Q268 32 316-6Q369 41 370 98" fill="none" stroke="#FFF9EF" strokeWidth="6"/>
    <Rect x="263" y="104" width="11" height="136" fill="#FFF9EF"/>
    <Rect x="362" y="104" width="15" height="136" fill="#F4E8D4"/>
    <Path d="M258 100H279V107H258M355 100H382V108H355" fill="#E7D6BB"/>
    <Path d="M295 213L299 184Q302 180 307 185L313 213Z" fill="#C8C2B4" opacity=".4"/>
    <Ellipse cx="304" cy="177" rx="4" ry="6" fill="#C2BCAF" opacity=".5"/>
    <Path d="M302 204H322V240H302Z" fill="#E9E1D2"/>
    <Rect x="386" width="14" height="240" fill="#F9F3E8"/><Rect x="402" width="5" height="240" fill="#D2C1AB" opacity=".4"/>
    <G transform="translate(323 83)">
      <Path d="M49 42Q24 42 20 71Q17 88 2 112L-17 157H91L88 112Q76 92 78 73Q80 61 66 53L68 37Z" fill={`url(#${id}-marble)`}/>
      <Path d="M22 68Q36 76 47 73Q69 67 78 79M29 83Q38 95 48 115L45 157M9 111Q20 111 30 118" fill="none" stroke="#C4B59E" strokeWidth="1.4" opacity=".5"/>
      <Path d="M44 45L42 58Q50 65 62 55L64 34Z" fill="#E9DCCA"/>
      <Path d="M44 2Q64-4 72 13L69 30L61 43Q49 51 40 41L34 34L26 31L33 24L31 14Z" fill={`url(#${id}-marble)`}/>
      <Path d="M34 18L45 19M38 21L39 23M32 31L39 33M40 39Q47 44 53 37" fill="none" stroke="#BCA88E" strokeWidth="1.2"/>
      <Path d="M30 17Q23 6 33 0Q29-12 43-9Q50-20 58-10Q68-17 76-7Q92-4 83 8Q89 20 76 24L70 34Q62 35 61 28L64 14Q50 19 49 8Q42 14 30 17Z" fill="#DCCBB3"/>
      <Path d="M28 7Q40-1 44 9M38-7Q48-9 49 3M51-11Q62-7 56 4M65-9Q76-4 67 6M74 2Q84 9 74 15M56 8Q68 7 64 18M67 22Q73 16 77 21" stroke="#FFF5E3" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <Path d="M52 73Q29 82 21 109L3 153M70 87Q57 106 47 115" fill="none" stroke="#FFFBF2" strokeWidth="4" opacity=".7"/>
    </G>
    <Rect width="420" height="240" fill={`url(#${id}-fade)`}/>
  </Svg>;
}

export function PortraitPlaceholder() {
  const id = useId().replace(/:/g, '');
  return <Svg width="100%" height="100%" viewBox="0 0 120 120" accessible={false}>
    <Defs><LinearGradient id={`${id}-portrait`} x1="0" y1="0" x2="1" y2="1"><Stop stopColor="#E2D5C5"/><Stop offset="1" stopColor="#F7F1E5"/></LinearGradient></Defs>
    <Rect width="120" height="120" fill={`url(#${id}-portrait)`}/>
    <Path d="M84 0H91V120H84M12 0H16V120H12" stroke="#FFF8ED" strokeWidth="5" opacity=".65"/>
    <Ellipse cx="61" cy="121" rx="44" ry="36" fill="#373936"/>
    <Path d="M39 70Q23 50 34 27Q47 8 69 13Q95 18 94 50Q92 65 77 81Z" fill="#34302E"/>
    <Circle cx="33" cy="62" r="17" fill="#393331"/>
    <Path d="M53 68L51 88Q62 99 77 86L70 65Z" fill="#CEAC8C"/>
    <Path d="M49 27Q76 20 82 41L85 56L78 58Q77 75 64 79Q50 77 45 65L41 45Z" fill="#E3C4A5"/>
    <Path d="M47 45Q51 39 58 41M70 40L77 41M60 55L67 59L72 57M60 68Q68 71 74 66" fill="none" stroke="#9B755E" strokeWidth="1.5" strokeLinecap="round"/>
    <Path d="M50 47L56 46M72 46L77 46" stroke="#423A35" strokeWidth="2" strokeLinecap="round"/>
    <Path d="M38 60Q37 32 57 22Q65 27 76 28L84 46Q88 18 65 15Q34 11 32 41Z" fill="#302D2B"/>
    <Path d="M36 33Q41 23 51 22M38 43Q43 31 48 29M24 61Q23 50 33 50M27 68Q18 60 26 54" fill="none" stroke="#6A5A4C" strokeWidth="2" opacity=".6"/>
    <Path d="M49 84L62 95L76 83L90 120H32Z" fill="#282D2B"/>
    <Path d="M42 99L47 119M50 97L55 120M64 101V120M74 97L78 120" stroke="#515451" strokeWidth="1"/>
    <Circle cx="77" cy="59" r="2.3" fill="#CFAF70"/>
  </Svg>;
}

export function ReflectionIllustration() {
  const id = useId().replace(/:/g, '');
  return <Svg width="100%" height="100%" viewBox="0 0 400 165" preserveAspectRatio="xMidYMid slice" accessible={false}>
    <Defs>
      <LinearGradient id={`${id}-background`} x1="0" y1="1" x2="1" y2="0"><Stop stopColor="#FFF9F0"/><Stop offset=".53" stopColor="#F6E7EA"/><Stop offset="1" stopColor="#D8CBE5"/></LinearGradient>
      <RadialGradient id={`${id}-orb`} cx="32%" cy="70%" rx="75%" ry="75%"><Stop stopColor="#FFF4E8"/><Stop offset=".48" stopColor="#F4DCE4"/><Stop offset="1" stopColor="#C8B5D6"/></RadialGradient>
      <LinearGradient id={`${id}-rock`} x1="0" y1="0" x2="1" y2="1"><Stop stopColor="#DDD3DB"/><Stop offset="1" stopColor="#AC9CAB"/></LinearGradient>
      <LinearGradient id={`${id}-veil`} x1="0" y1="0" x2="1" y2="0"><Stop stopColor="#FFFAF4" stopOpacity=".9"/><Stop offset=".58" stopColor="#FFFAF4" stopOpacity=".72"/><Stop offset=".8" stopColor="#FFFAF4" stopOpacity="0"/></LinearGradient>
    </Defs>
    <Rect width="400" height="165" fill={`url(#${id}-background)`}/>
    <Circle cx="303" cy="98" r="76" fill={`url(#${id}-orb)`}/>
    <Path d="M374 165L365 139L374 112L365 96L380 77L386 57L402 43V165Z" fill={`url(#${id}-rock)`}/>
    <Path d="M389 68L385 93L374 104L382 115L374 141L385 157M389 110L393 134L380 151" stroke="#A697A9" fill="none" strokeWidth="1.2"/>
    <Path d="M249 166L250 119L266 104L279 114L272 140L279 165" fill="#C3B4BF"/>
    <Path d="M251 120L263 129L265 157L273 139L267 115L266 104" fill="#E7DDE1"/>
    <Path d="M241 161L261 151L297 157L313 165Z" fill="#D9CED3"/>
    <Path d="M247 161L263 158L278 163M366 154L379 149L395 157" stroke="#B4A1AF" fill="none"/>
    <Ellipse cx="239" cy="161" rx="11" ry="2" fill="#A697AA" opacity=".3"/>
    <Circle cx="237" cy="124" r="2.7" fill="#4B4041"/>
    <Path d="M233 129Q237 126 241 130L244 146L240 150L239 161H237L236 150L234 161H232L233 146L230 144Z" fill="#514A4A"/>
    <Rect width="400" height="165" fill={`url(#${id}-veil)`}/>
  </Svg>;
}
