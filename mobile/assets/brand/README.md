The Unframe lockup and standalone open-frame mark follow the supplied brand reference. Forest green and terracotta adapt the original black and blue to the museum interface; the inverse treatment uses warm ivory on dark surfaces.

`unframe-logo.png` and `unframe-mark.png` are transparent masters. `BrandLogo` and `BrandMark` share these assets across the interface. Run `npm run brand:assets` from the repository root to regenerate the opaque 1024px launcher icon, Android adaptive/themed foreground, transparent splash image and browser favicon. Android's foreground keeps the whole mark inside its central circular safe area.

Native launcher and splash changes require a rebuilt native application; Expo Go uses its own launcher icon. Web favicon changes may require a hard refresh after restarting Expo.
