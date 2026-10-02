import { useFonts } from 'expo-font';
import {
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader';

export const DAYTALE_FONT_FILES = {
  Fredoka_600SemiBold,
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Newsreader_400Regular,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} as const;

export function useDaytaleFonts(): [loaded: boolean, error: Error | null] {
  return useFonts(DAYTALE_FONT_FILES);
}
