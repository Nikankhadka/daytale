import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabPlaceholderProps = {
  title: string;
  description: string;
  accessibilityLabel: string;
};

export function TabPlaceholder({ title, description, accessibilityLabel }: TabPlaceholderProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container} accessibilityLabel={accessibilityLabel}>
        <Text style={styles.wordmark}>Daytale</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.foundationNote}>
          <Text style={styles.note}>Foundation shell</Text>
          <Text style={styles.noteBody}>Product screens arrive in DYT-004.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fffaf8',
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  wordmark: {
    color: '#8f3148',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
  },
  title: {
    color: '#3d2730',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: '#654e56',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 360,
  },
  foundationNote: {
    borderLeftWidth: 3,
    borderLeftColor: '#e6a9a8',
    marginTop: 32,
    paddingLeft: 12,
  },
  note: {
    color: '#8f3148',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  noteBody: {
    color: '#654e56',
    fontSize: 13,
  },
});
