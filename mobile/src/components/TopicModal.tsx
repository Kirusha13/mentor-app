import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TheoryTopic } from '../api/materials';
import TopicDetailContent from './TopicDetailContent';

interface Props {
  visible: boolean;
  topic: TheoryTopic | null;
  allTopics: TheoryTopic[];
  loading?: boolean;
  onClose: () => void;
}

export default function TopicModal({ visible, topic, allTopics, loading, onClose }: Props) {
  const [stack, setStack] = useState<TheoryTopic[]>([]);
  const currentTopic = stack.length > 0 ? stack[stack.length - 1] : topic;

  const handleNavigate = (t: TheoryTopic) => {
    setStack(prev => [...prev, t]);
  };

  const handleBack = () => {
    setStack(prev => prev.slice(0, -1));
  };

  const handleClose = () => {
    setStack([]);
    onClose();
  };

  const canGoBack = stack.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={canGoBack ? handleBack : handleClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={canGoBack ? handleBack : handleClose}
            activeOpacity={0.7}
          >
            {canGoBack ? (
              <Ionicons name="chevron-back" size={22} color="#2AABEE" />
            ) : (
              <Ionicons name="close" size={22} color="#333" />
            )}
          </TouchableOpacity>

          <Text style={styles.title} numberOfLines={1}>
            {currentTopic?.title ?? ''}
          </Text>

          {canGoBack ? (
            <TouchableOpacity style={styles.sideBtn} onPress={handleClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#aaa" />
            </TouchableOpacity>
          ) : (
            <View style={styles.sideBtn} />
          )}
        </View>

        {loading || !currentTopic ? (
          <ActivityIndicator style={{ marginTop: 60 }} color="#2AABEE" />
        ) : (
          <TopicDetailContent
            key={currentTopic.id}
            topic={currentTopic}
            allTopics={allTopics}
            onNavigateTopic={handleNavigate}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#fff',
  },
  sideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
});
