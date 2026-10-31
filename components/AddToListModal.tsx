import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from 'react-native';
import BottomSheet from './BottomSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { List } from '../types';
import { theme } from '../lib/theme';

interface AddToListModalProps {
  visible: boolean;
  lists: List[];
  placeLists: List[]; // lists that already contain this place
  onToggle: (listId: string) => void;
  onClose: () => void;
}

export default function AddToListModal({
  visible,
  lists,
  placeLists,
  onToggle,
  onClose,
}: AddToListModalProps) {
  const myLists = lists.filter(l => !l.importedFrom);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add to List" maxHeightFraction={0.7}>
      {myLists.length === 0 ? (
        <Text style={styles.emptyText}>No lists yet. Create one in the Lists tab.</Text>
      ) : (
        <FlatList
          data={myLists}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isInList = placeLists.some(l => l.id === item.id);
            return (
              <TouchableOpacity style={styles.listItem} onPress={() => onToggle(item.id)} activeOpacity={0.7}>
                <MaterialCommunityIcons
                  name={isInList ? 'check-circle' : 'circle-outline'}
                  size={22}
                  color={isInList ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text style={styles.listName}>{item.name}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '70%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.text,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  listName: {
    ...theme.typography.body,
    color: theme.colors.text,
    flex: 1,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
});
