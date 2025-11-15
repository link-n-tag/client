import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const STORAGE_KEY = 'link-tag-storage';

function App() {
  const [links, setLinks] = useState([]);
  const [editingLinkId, setEditingLinkId] = useState(null); // Track which link is being edited
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState('');
  const [modalTags, setModalTags] = useState('');
  const [modalInputValue, setModalInputValue] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedTag, setDraggedTag] = useState(null);
  const [dragOverLinkId, setDragOverLinkId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [tagCaseMode, setTagCaseMode] = useState('camelCase'); // 'camelCase' or 'snake_case'
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteInputType, setAutocompleteInputType] = useState(null); // 'modal'
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameOldTag, setRenameOldTag] = useState('');
  const [renameNewTag, setRenameNewTag] = useState('');
  const [renameAffectedCount, setRenameAffectedCount] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const modalTitleRef = useRef(null);

  // Handle paste event to open modal
  const handlePaste = useCallback(async (e) => {
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    const urlPattern = /^(https?|file):\/\/.+/i;
    
    if (urlPattern.test(pastedText.trim())) {
      e.preventDefault();
      const url = pastedText.trim();
      
      // Clear search term
      setSearchTerm('');
      
      // Check if URL already exists - if so, open it for editing in modal
      const existingLink = links.find(link => link.url === url);
      if (existingLink) {
        // Open existing link for editing in modal
        const tagsDisplay = existingLink.tags 
          ? existingLink.tags.split(',').map(t => `#${t.trim()}`).join(' ')
          : '';
        setEditingLinkId(existingLink.id);
        setModalUrl(existingLink.url);
        setModalTags(tagsDisplay);
        setModalInputValue(tagsDisplay);
        setShowModal(true);
        return;
      }
      
      // Open modal with URL (new link)
      setEditingLinkId(null); // Ensure we're creating, not editing
      setModalUrl(url);
      setModalTags('');
      setModalInputValue('');
      setShowModal(true);
    }
  }, [links]);

  // Read query parameters on mount and handle browser navigation
  useEffect(() => {
    const updateTagsFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tagsParam = params.get('tags');
      if (tagsParam) {
        const tags = tagsParam.split(',').filter(t => t.trim());
        setSelectedTags(tags);
      } else {
        setSelectedTags([]);
      }
    };

    // Read on mount
    updateTagsFromUrl();

    // Listen for browser back/forward navigation
    window.addEventListener('popstate', updateTagsFromUrl);
    return () => window.removeEventListener('popstate', updateTagsFromUrl);
  }, []);

  useEffect(() => {
    loadLinks();
    // Load theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.add('light-mode');
    } else {
      setIsDarkMode(true);
      // Dark mode is default, no class needed
      document.documentElement.classList.remove('light-mode');
    }
    // Load tag case mode preference
    const savedTagCaseMode = localStorage.getItem('tagCaseMode');
    if (savedTagCaseMode === 'snake_case' || savedTagCaseMode === 'camelCase') {
      setTagCaseMode(savedTagCaseMode);
    }
  }, []);

  // Handle modal save
  const handleModalSave = () => {
    if (!modalUrl.trim()) {
      return;
    }
    
    // Parse tags
    const tagParts = modalTags.trim().split(/\s+/).filter(t => t.startsWith('#'));
    const normalizedTags = tagParts
      .map(tag => {
        const tagWithoutHash = tag.startsWith('#') ? tag.slice(1) : tag;
        return tagWithoutHash ? normalizeTag(tagWithoutHash) : '';
      })
      .filter(t => t)
      .join(', ');
    
    if (editingLinkId) {
      // Update existing link
      const updatedLinks = links.map(link => 
        link.id === editingLinkId
          ? {
              ...link,
              title: '', // No longer used, but keep for backward compatibility
              url: modalUrl.trim(),
              tags: normalizedTags || ''
            }
          : link
      );
      saveLinks(updatedLinks);
      setEditingLinkId(null);
    } else {
      // Create new link
      const newLink = {
        id: Date.now(),
        title: '', // No longer used, but keep for backward compatibility
        url: modalUrl.trim(),
        tags: normalizedTags || '',
        created_at: new Date().toISOString()
      };
      saveLinks([...links, newLink]);
    }
    
    setShowModal(false);
    setModalUrl('');
    setModalTags('');
    setModalInputValue('');
  };
  
  // Handle modal cancel
  const handleModalCancel = () => {
    setShowModal(false);
    setModalUrl('');
    setModalTags('');
    setModalInputValue('');
    setEditingLinkId(null);
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    if (newTheme) {
      document.documentElement.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleTagCaseMode = () => {
    const newMode = tagCaseMode === 'camelCase' ? 'snake_case' : 'camelCase';
    setTagCaseMode(newMode);
    localStorage.setItem('tagCaseMode', newMode);

    // Convert all existing tags to the new mode
    const updatedLinks = links.map(link => {
      if (link.tags && link.tags.trim()) {
        const tags = link.tags.split(',').map(t => t.trim()).filter(t => t);
        const convertedTags = tags.map(tag => convertTagCase(tag, newMode));
        return {
          ...link,
          tags: convertedTags.join(', ')
        };
      }
      return link;
    });
    saveLinks(updatedLinks);
  };


  const loadLinks = () => {
    try {
      const storedLinks = localStorage.getItem(STORAGE_KEY);
      if (storedLinks) {
        setLinks(JSON.parse(storedLinks));
      }
    } catch (error) {
      console.error('Error loading links:', error);
    }
  };

  const saveLinks = (linksToSave) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(linksToSave));
      setLinks(linksToSave);
    } catch (error) {
      console.error('Error saving links:', error);
    }
  };


  const getDomainFromUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      // If URL parsing fails, try to extract domain manually
      const match = url.match(/https?:\/\/(?:www\.)?([^/]+)/i);
      return match ? match[1] : url;
    }
  };






  const updateAutocomplete = (text, inputElement, inputType) => {
    if (!inputElement) return;
    
    const cursorPosition = inputElement.selectionStart;
    const textBeforeCursor = text.substring(0, cursorPosition);
    
    // Find the last # and check if we're in a tag
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');
    
    if (lastHashIndex === -1) {
      setShowAutocomplete(false);
      setAutocompleteInputType(null);
      return;
    }
    
    // Check if there's a space after the # (meaning we're not in a tag)
    const textAfterHash = textBeforeCursor.substring(lastHashIndex + 1);
    if (textAfterHash.includes(' ')) {
      setShowAutocomplete(false);
      setAutocompleteInputType(null);
      return;
    }
    
    // Get the current tag being typed
    const currentTag = textAfterHash.trim();
    
    // Get all tags from links
    const tagSet = new Set();
    links.forEach(link => {
      if (link.tags) {
        link.tags.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagSet.add(trimmedTag);
          }
        });
      }
    });
    
    // Add domain tags
    links.forEach(link => {
      if (link.url) {
        const domainTag = getDomainTag(link.url);
        if (domainTag) {
          tagSet.add(domainTag);
        }
      }
    });
    
    const allTags = Array.from(tagSet);
    
    // Filter tags that match
    const suggestions = allTags
      .filter(tag => {
        const tagLower = tag.toLowerCase();
        const currentLower = currentTag.toLowerCase();
        return tagLower.startsWith(currentLower) && tagLower !== currentLower;
      })
      .slice(0, 5); // Limit to 5 suggestions
    
      if (suggestions.length > 0) {
        setAutocompleteSuggestions(suggestions);
        setAutocompleteIndex(-1);
        setAutocompleteInputType(inputType);
        setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
      setAutocompleteInputType(null);
    }
  };

  const insertAutocompleteSuggestion = (suggestion, inputValue, inputElement, inputType = 'modal') => {
    if (!inputElement) return;
    
    const cursorPosition = inputElement.selectionStart;
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');
    
    if (lastHashIndex === -1) return inputValue;
    
    const textAfterCursor = inputValue.substring(cursorPosition);
    
    const newText = 
      inputValue.substring(0, lastHashIndex + 1) + 
      suggestion + 
      ' ' + 
      textAfterCursor;
    
    if (inputType === 'modal') {
      // Update the raw input value first
      setModalInputValue(newText);
      
      // Parse tags only (no title anymore)
      const words = newText.match(/\S+/g) || [];
      const tagParts = [];
      
      words.forEach(word => {
        if (word.startsWith('#')) {
          tagParts.push(word);
        }
      });
      
      setModalTags(tagParts.join(' '));
    } else if (inputType === 'modal-tags') {
      setModalTags(newText);
    }
    
    setShowAutocomplete(false);
    
    // Set cursor position after the inserted tag
    setTimeout(() => {
      const newPosition = lastHashIndex + 1 + suggestion.length + 1;
      inputElement.setSelectionRange(newPosition, newPosition);
      inputElement.focus();
    }, 0);
    
    return newText;
  };

  // Convert tag with spaces to camelCase or snake_case
  const toCamelCase = (str) => {
    if (!str || !str.includes(' ')) return str;
    return str
      .split(' ')
      .map((word, index) => {
        if (index === 0) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('');
  };

  const toSnakeCase = (str) => {
    if (!str) return str;
    // Convert camelCase to snake_case
    if (!str.includes(' ') && /[A-Z]/.test(str)) {
      return str.replace(/([A-Z])/g, '_$1').toLowerCase();
    }
    // Convert spaces to underscores
    if (str.includes(' ')) {
      return str.toLowerCase().replace(/\s+/g, '_');
    }
    return str.toLowerCase();
  };

  const convertTagCase = (tag, targetMode) => {
    if (!tag) return tag;
    if (targetMode === 'snake_case') {
      return toSnakeCase(tag);
    } else {
      // Convert to camelCase
      if (tag.includes('_')) {
        return tag
          .split('_')
          .map((word, index) => {
            if (index === 0) {
              return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join('');
      }
      return toCamelCase(tag);
    }
  };

  const normalizeTag = (tag) => {
    if (!tag) return tag;
    // Remove leading '#' if present (we add it for display only)
    let cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
    // First convert spaces to the current mode
    if (cleanTag.includes(' ')) {
      cleanTag = tagCaseMode === 'snake_case' ? toSnakeCase(cleanTag) : toCamelCase(cleanTag);
    } else {
      // Then convert existing tags to match current mode
      cleanTag = convertTagCase(cleanTag, tagCaseMode);
    }
    return cleanTag;
  };



  // Detect and handle tag rename pattern: > rename|#oldName|#newName
  const detectTagRename = (text) => {
    const pattern = /^>\s*rename\s*\|\s*#([^\s#|]+)\s*\|\s*#([^\s#|]+)$/i;
    const match = text.trim().match(pattern);
    if (match) {
      const oldTag = match[1].trim();
      const newTag = match[2].trim();
      
      // Normalize tags
      const normalizedOldTag = normalizeTag(oldTag);
      const normalizedNewTag = normalizeTag(newTag);
      
      // Count affected links
      let affectedCount = 0;
      links.forEach(link => {
        if (link.tags) {
          const tags = link.tags.split(',').map(t => t.trim());
          if (tags.some(t => normalizeTag(t).toLowerCase() === normalizedOldTag.toLowerCase())) {
            affectedCount++;
          }
        }
      });
      
      if (affectedCount > 0) {
        setRenameOldTag(normalizedOldTag);
        setRenameNewTag(normalizedNewTag);
        setRenameAffectedCount(affectedCount);
        setShowRenameModal(true);
        return true;
      }
    }
    return false;
  };

  // Rename tag across all links
  const handleRenameTag = () => {
    const updatedLinks = links.map(link => {
      if (link.tags) {
        const tags = link.tags.split(',').map(t => t.trim()).filter(t => t);
        const updatedTags = tags.map(tag => {
          const normalizedTag = normalizeTag(tag);
          if (normalizedTag.toLowerCase() === renameOldTag.toLowerCase()) {
            return renameNewTag;
          }
          return tag;
        });
        return {
          ...link,
          tags: updatedTags.join(', ')
        };
      }
      return link;
    });
    
    saveLinks(updatedLinks);
    setShowRenameModal(false);
    setSearchTerm('');
    setRenameOldTag('');
    setRenameNewTag('');
    setRenameAffectedCount(0);
  };

  const handleRenameCancel = () => {
    setShowRenameModal(false);
    setSearchTerm('');
    setRenameOldTag('');
    setRenameNewTag('');
    setRenameAffectedCount(0);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const updatedLinks = links.filter(link => link.id !== id);
    saveLinks(updatedLinks);
  };

  const handleLinkClick = (link) => {
    // Open modal for editing
    const tagsDisplay = link.tags 
      ? link.tags.split(',').map(t => `#${t.trim()}`).join(' ')
      : '';
    setEditingLinkId(link.id);
    setModalUrl(link.url);
    setModalTags(tagsDisplay);
    setModalInputValue(tagsDisplay);
    setShowModal(true);
  };

  // Drag and Drop handlers
  const handleTagDragStart = (e, tag) => {
    setDraggedTag(tag);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tag);
  };

  const handleTagDragEnd = () => {
    setDraggedTag(null);
    setDragOverLinkId(null);
  };

  const handleLinkDragOver = (e, linkId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverLinkId(linkId);
  };

  const handleLinkDragLeave = () => {
    setDragOverLinkId(null);
  };

  const handleLinkDrop = (e, linkId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverLinkId(null);
    
    if (draggedTag) {
      // Don't allow dropping domain tags or #noTag (they're computed/reserved)
      if (draggedTag.startsWith('@') || draggedTag.toLowerCase() === 'notag') {
        setDraggedTag(null);
        return;
      }
      
      const link = links.find(l => l.id === linkId);
      if (link) {
        const existingTags = link.tags ? link.tags.split(',').map(t => t.trim()).filter(t => t) : [];
        
        // Convert tag with spaces to current mode
        const normalizedTag = normalizeTag(draggedTag);
        
        // Don't add if tag already exists
        if (!existingTags.some(t => t.toLowerCase() === normalizedTag.toLowerCase())) {
          existingTags.push(normalizedTag);
          const updatedLinks = links.map(l => 
            l.id === linkId
              ? { ...l, tags: existingTags.join(', ') }
              : l
          );
          saveLinks(updatedLinks);
        }
      }
    }
    setDraggedTag(null);
  };

  // Get favicon URL
  const getFaviconUrl = (url) => {
    // Return default file icon for file:// URLs
    if (url && url.toLowerCase().startsWith('file://')) {
      // Return a simple file icon as SVG data URI
      const fileIconSvg = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 2H12V14H4V2Z" stroke="#7aa3a3" stroke-width="1.5" fill="none"/>
        <path d="M5 5H11" stroke="#7aa3a3" stroke-width="1.5"/>
        <path d="M5 7H11" stroke="#7aa3a3" stroke-width="1.5"/>
        <path d="M5 9H9" stroke="#7aa3a3" stroke-width="1.5"/>
      </svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fileIconSvg)}`;
    }
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch (e) {
      return '';
    }
  };

  const getDomainTag = (url) => {
    if (!url) return null;
    // Return @file for file:// URLs
    if (url.toLowerCase().startsWith('file://')) {
      return '@file';
    }
    const domain = getDomainFromUrl(url);
    return domain ? `@${domain}` : null;
  };

  // Get all domain tags from links
  const getAllDomainTags = () => {
    const domainSet = new Set();
    links.forEach(link => {
      if (link.url) {
        const domainTag = getDomainTag(link.url);
        if (domainTag) {
          domainSet.add(domainTag);
        }
      }
    });
    return Array.from(domainSet);
  };

  // Calculate cardinality (total count) of each tag across all links
  const getTagCardinality = () => {
    const cardinality = {};
    
    // Count regular tags
    links.forEach(link => {
      if (link.tags) {
        link.tags.split(',').map(t => t.trim().toLowerCase()).forEach(tag => {
          if (tag) {
            cardinality[tag] = (cardinality[tag] || 0) + 1;
          }
        });
      }
    });
    
    // Count domain tags
    links.forEach(link => {
      if (link.url) {
        const domainTag = getDomainTag(link.url);
        if (domainTag) {
          const domainTagLower = domainTag.toLowerCase();
          cardinality[domainTagLower] = (cardinality[domainTagLower] || 0) + 1;
        }
      }
    });
    
    return cardinality;
  };

  // Get color based on tag cardinality (bluer = higher, greyer = lower)
  const getTagColor = (tag, tagCardinality) => {
    const cardinality = tagCardinality[tag.toLowerCase()] || 0;
    const maxCardinality = Math.max(...Object.values(tagCardinality), 1);
    const normalized = cardinality / maxCardinality;
    
    // Use different color ranges based on theme
    let grey, blue;
    if (isDarkMode) {
      // Dark mode: darker colors
      // Grey: rgb(80, 80, 80)
      // Blue: rgb(70, 100, 100)
      grey = { r: 80, g: 80, b: 80 };
      blue = { r: 70, g: 100, b: 100 };
    } else {
      // Light mode: darker colors for better contrast
      // Grey: rgb(140, 140, 140)
      // Blue: rgb(100, 140, 140)
      grey = { r: 140, g: 140, b: 140 };
      blue = { r: 100, g: 140, b: 140 };
    }
    
    const r = Math.round(grey.r + (blue.r - grey.r) * normalized);
    const g = Math.round(grey.g + (blue.g - grey.g) * normalized);
    const b = Math.round(grey.b + (blue.b - grey.b) * normalized);
    
    return `rgb(${r}, ${g}, ${b})`;
  };


  // Extract tags intelligently based on selected tags
  const getAvailableTags = () => {
    const tagCardinality = getTagCardinality();
    
    if (selectedTags.length === 0) {
      const tagSet = new Set();
      
      // Add regular tags
      links.forEach(link => {
        if (link.tags) {
          link.tags.split(',').forEach(tag => {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
              tagSet.add(trimmedTag);
            }
          });
        }
      });
      
      // Add domain tags
      const domainTags = getAllDomainTags();
      domainTags.forEach(domainTag => {
        tagSet.add(domainTag);
      });
      
      // Convert to array and sort by cardinality (descending)
      const tagArray = Array.from(tagSet).map(tag => ({
        tag,
        cardinality: tagCardinality[tag.toLowerCase()] || 0
      }));
      
      tagArray.sort((a, b) => b.cardinality - a.cardinality);
      
      const sortedTags = tagArray.map(item => item.tag);
      
      return sortedTags;
    } else {
      const selectedTagsLower = selectedTags.map(t => t.toLowerCase());
      
      // If #noTag is selected, don't show co-occurring tags
      if (selectedTagsLower.includes('notag')) {
        return [];
      }
      
      const coOccurringTags = new Map();
      
      links.forEach(link => {
        // Get all tags for this link (regular + domain)
        const linkTags = link.tags ? link.tags.split(',').map(t => t.trim()) : [];
        const domainTag = getDomainTag(link.url);
        if (domainTag) {
          linkTags.push(domainTag);
        }
        
        const linkTagsLower = linkTags.map(t => t.toLowerCase());
        
        const hasAllSelectedTags = selectedTagsLower.every(selectedTag => 
          linkTagsLower.includes(selectedTag)
        );
        
        if (hasAllSelectedTags) {
          linkTags.forEach(tag => {
            const tagLower = tag.toLowerCase();
            if (!selectedTagsLower.includes(tagLower) && tag) {
              coOccurringTags.set(tagLower, tag);
            }
          });
        }
      });
      
      let minCardinality = Infinity;
      coOccurringTags.forEach((originalTag, tagLower) => {
        const cardinality = tagCardinality[tagLower] || 0;
        if (cardinality < minCardinality) {
          minCardinality = cardinality;
        }
      });
      
      const result = [];
      coOccurringTags.forEach((originalTag, tagLower) => {
        if (tagCardinality[tagLower] === minCardinality) {
          result.push({
            tag: originalTag,
            cardinality: tagCardinality[tagLower] || 0
          });
        }
      });
      
      // Sort by cardinality (descending)
      result.sort((a, b) => b.cardinality - a.cardinality);
      
      return result.map(item => item.tag);
    }
  };

  const getAllTagsInSystem = () => {
    const tagSet = new Set();
    
    // Add regular tags
    links.forEach(link => {
      if (link.tags) {
        link.tags.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagSet.add(trimmedTag);
          }
        });
      }
    });
    
    // Add domain tags
    const domainTags = getAllDomainTags();
    domainTags.forEach(domainTag => {
      tagSet.add(domainTag);
    });
    
    return Array.from(tagSet);
  };

  const allTags = getAvailableTags();
  const allTagsInSystem = getAllTagsInSystem();
  const shouldShowTagsSection = allTagsInSystem.length > 0 || selectedTags.length > 0;

  // Update URL query parameters when selectedTags changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedTags.length > 0) {
      params.set('tags', selectedTags.join(','));
    }
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedTags]);

  const handleTagClick = (tag) => {
    const tagLower = tag.toLowerCase();
    const isSelected = selectedTags.some(t => t.toLowerCase() === tagLower);
    
    if (isSelected) {
      setSelectedTags(selectedTags.filter(t => t.toLowerCase() !== tagLower));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const filteredLinks = links.filter(link => {
    // Skip filtering if search term starts with ">" (special command)
    if (searchTerm.trim().startsWith('>')) {
      // Still filter by selected tags if any
      if (selectedTags.length === 0) {
        return true; // Show all links if no tags selected
      }
      // Continue to tag filtering below
    }
    
    // Filter by selected tags
    if (selectedTags.length > 0) {
      const selectedTagsLower = selectedTags.map(t => t.toLowerCase());
      
      // Handle #noTag special case
      if (selectedTagsLower.includes('notag')) {
        // If #noTag is selected, only show links without tags
        const hasNoTags = !link.tags || link.tags.trim() === '';
        if (!hasNoTags) {
          return false;
        }
        // If other tags are also selected with #noTag, this shouldn't happen, but handle it
        const otherTags = selectedTagsLower.filter(t => t !== 'notag');
        if (otherTags.length > 0) {
          return false; // Can't have both noTag and other tags
        }
      } else {
        // Get all tags for this link (regular + domain)
        const linkTags = link.tags ? link.tags.split(',').map(t => t.trim().toLowerCase()) : [];
        const domainTag = getDomainTag(link.url);
        if (domainTag) {
          linkTags.push(domainTag.toLowerCase());
        }
        
        // Check if link has all selected tags
        const hasAllSelectedTags = selectedTagsLower.every(selectedTag => 
          linkTags.includes(selectedTag)
        );
        if (!hasAllSelectedTags) {
          return false;
        }
      }
    }
    
    // Filter by search term (searches in URL and tags) - skip if it starts with ">"
    if (searchTerm.trim() && !searchTerm.trim().startsWith('>')) {
      const searchLower = searchTerm.toLowerCase().trim();
      
      // Check tags
      const linkTags = link.tags ? link.tags.split(',').map(t => t.trim().toLowerCase()) : [];
      const domainTag = getDomainTag(link.url);
      if (domainTag) {
        linkTags.push(domainTag.toLowerCase());
      }
      const tagMatch = linkTags.some(tag => tag.includes(searchLower));
      
      // Check URL
      const urlMatch = link.url.toLowerCase().includes(searchLower);
      
      if (!tagMatch && !urlMatch) {
        return false;
      }
    }
    
    return true;
  }).sort((a, b) => {
    // Sort: links without tags first, then by creation date (newest first)
    const aHasTags = a.tags && a.tags.trim() !== '';
    const bHasTags = b.tags && b.tags.trim() !== '';
    
    if (!aHasTags && bHasTags) return -1;
    if (aHasTags && !bHasTags) return 1;
    
    // Both have tags or both don't - sort by creation date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div className="App">
      <footer className="app-footer">
        <span className="app-title">link-n-tag</span>
      </footer>
      <main className="app-main">
        {shouldShowTagsSection && (() => {
          const tagCardinality = getTagCardinality();
          return (
            <div className="tags-section">
              <div className="tags-list">
                {selectedTags.map(tag => {
                  const isInAvailableTags = allTags.some(t => t.toLowerCase() === tag.toLowerCase());
                  const isNoTag = tag.toLowerCase() === 'notag';
                  const isDomainTag = tag.startsWith('@');
                  const displayTag = isDomainTag ? tag : (tag.startsWith('#') ? tag : `#${tag}`);
                  if (!isInAvailableTags) {
                    const tagColor = !isNoTag ? getTagColor(tag, tagCardinality) : undefined;
                    return (
                      <button
                        key={tag}
                        className={`tag-filter active ${isNoTag ? 'no-tag-reserved' : ''} ${isDomainTag ? 'domain-tag' : ''}`}
                        style={tagColor ? { backgroundColor: tagColor } : undefined}
                        onClick={() => handleTagClick(tag)}
                        draggable={!isNoTag && !isDomainTag}
                        onDragStart={!isNoTag && !isDomainTag ? (e) => handleTagDragStart(e, tag) : undefined}
                        onDragEnd={handleTagDragEnd}
                      >
                        {displayTag}
                      </button>
                    );
                  }
                  return null;
                })}
                {allTags.map(tag => {
                  const isSelected = selectedTags.some(t => t.toLowerCase() === tag.toLowerCase());
                  const isNoTag = tag.toLowerCase() === 'notag';
                  const isDomainTag = tag.startsWith('@');
                  const displayTag = isDomainTag ? tag : (tag.startsWith('#') ? tag : `#${tag}`);
                  const tagColor = !isNoTag ? getTagColor(tag, tagCardinality) : undefined;
                  return (
                    <button
                      key={tag}
                      className={`tag-filter ${isSelected ? 'active' : ''} ${draggedTag === tag ? 'dragging' : ''} ${isNoTag ? 'no-tag-reserved' : ''} ${isDomainTag ? 'domain-tag' : ''}`}
                      style={tagColor ? { backgroundColor: tagColor } : undefined}
                      onClick={() => handleTagClick(tag)}
                      draggable={!isNoTag && !isDomainTag}
                      onDragStart={!isNoTag && !isDomainTag ? (e) => handleTagDragStart(e, tag) : undefined}
                      onDragEnd={handleTagDragEnd}
                    >
                      {displayTag}
                    </button>
                  );
                })}
              {selectedTags.length > 0 && (
                <button 
                  className="tag-filter clear"
                  onClick={() => setSelectedTags([])}
                >
                  clear
                </button>
              )}
              </div>
            </div>
          );
        })()}

        <div className="links-container">
          <div className="paste-area-container">
            <input
              type="text"
              className="paste-area"
              placeholder="Paste URL to add link or type to search..."
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value;
                setSearchTerm(value);
              }}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                // If Enter is pressed
                if (e.key === 'Enter') {
                  // Check for tag rename pattern first: > rename|#oldName|#newName
                  if (detectTagRename(searchTerm)) {
                    e.preventDefault();
                    return;
                  }
                  
                  // If it's a URL, open modal
                  const urlPattern = /^(https?|file):\/\/.+/i;
                  if (urlPattern.test(searchTerm.trim())) {
                    e.preventDefault();
                    const url = searchTerm.trim();
                    
                    // Check if URL already exists
                    const existingLink = links.find(link => link.url === url);
                    if (existingLink) {
                      const tagsDisplay = existingLink.tags 
                        ? existingLink.tags.split(',').map(t => `#${t.trim()}`).join(' ')
                        : '';
                      setEditingLinkId(existingLink.id);
                      setModalUrl(existingLink.url);
                      setModalTags(tagsDisplay);
                      setModalInputValue(tagsDisplay);
                      setShowModal(true);
                      setSearchTerm('');
                    } else {
                      setEditingLinkId(null);
                      setModalUrl(url);
                      setModalTags('');
                      setModalInputValue('');
                      setShowModal(true);
                      setSearchTerm('');
                    }
                  }
                }
              }}
            />
          </div>

          {filteredLinks.length === 0 ? (
            <div className="empty-state">
              <p>
                {searchTerm.trim()
                  ? `No links found matching "${searchTerm}"`
                  : selectedTags.length > 0
                  ? `No links found with tags: ${selectedTags.map(t => `"${t}"`).join(', ')}`
                  : 'No links yet. Add your first link!'}
              </p>
            </div>
          ) : (
            <div className="links-list">
              {(() => {
                const tagCardinality = getTagCardinality();
                return filteredLinks.map((link, index) => {
                  const isEven = index % 2 === 0;
                
                return (
                  <div 
                    key={link.id}
                    data-link-id={link.id}
                    className={`link-item ${dragOverLinkId === link.id ? 'drag-over' : ''} ${isEven ? 'even' : 'odd'}`}
                    onClick={(e) => {
                      // Only open link if clicking on the box itself (not on tags/favicon/etc)
                      // Tags, favicon, and domain tags already have stopPropagation
                      if (e.target === e.currentTarget || !e.target.closest('.link-tag, .link-favicon, .link-delete')) {
                        // Open link when clicking on the box
                        if (link.url.toLowerCase().startsWith('file://')) {
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(link.url).then(() => {
                              try {
                                window.location.href = link.url;
                                setTimeout(() => {
                                  alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                                }, 100);
                              } catch (err) {
                                alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                              }
                            }).catch(() => {
                              alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                            });
                          } else {
                            alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                          }
                        } else {
                          window.open(link.url, '_blank', 'noopener,noreferrer');
                        }
                      }
                    }}
                    onDragOver={(e) => handleLinkDragOver(e, link.id)}
                    onDragLeave={handleLinkDragLeave}
                    onDrop={(e) => handleLinkDrop(e, link.id)}
                  >
                    <img 
                      src={getFaviconUrl(link.url)} 
                      alt="" 
                      className="link-favicon"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open link when favicon is clicked
                        if (link.url.toLowerCase().startsWith('file://')) {
                          // Handle file:// URLs specially
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(link.url).then(() => {
                              try {
                                window.location.href = link.url;
                                setTimeout(() => {
                                  alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                                }, 100);
                              } catch (err) {
                                alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                              }
                            }).catch(() => {
                              alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                            });
                          } else {
                            alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                          }
                        } else {
                          window.open(link.url, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    {(() => {
                      const domainTag = getDomainTag(link.url);
                      const domainTagColor = domainTag ? getTagColor(domainTag.toLowerCase(), tagCardinality) : undefined;
                      return domainTag ? (
                        <span 
                          className="link-tag domain-tag"
                          style={domainTagColor ? { backgroundColor: domainTagColor, cursor: 'pointer' } : { cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open link when domain tag is clicked
                            if (link.url.toLowerCase().startsWith('file://')) {
                              if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(link.url).then(() => {
                                  try {
                                    window.location.href = link.url;
                                    setTimeout(() => {
                                      alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                                    }, 100);
                                  } catch (err) {
                                    alert(`File path copied to clipboard.\n\nPath: ${link.url}\n\nNote: Due to browser security restrictions, file:// links cannot be opened directly from web pages. The path has been copied - you can paste it into your file manager.`);
                                  }
                                }).catch(() => {
                                  alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                                });
                              } else {
                                alert(`Cannot open file:// link due to browser security.\n\nPath: ${link.url}\n\nPlease copy this path and open it manually in your file manager.`);
                              }
                            } else {
                              window.open(link.url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                        >
                          {domainTag}
                        </span>
                      ) : null;
                    })()}
                    <div className="link-item-tags link-item-tags-right">
                      {(() => {
                        const regularTags = link.tags && link.tags.trim() 
                          ? link.tags.split(',').map(t => t.trim()).filter(t => t)
                          : [];
                        
                        // Sort regular tags by cardinality (highest to lowest)
                        const sortedTags = regularTags.sort((a, b) => {
                          const aClean = a.startsWith('#') ? a.slice(1) : a;
                          const bClean = b.startsWith('#') ? b.slice(1) : b;
                          const aCardinality = tagCardinality[aClean.toLowerCase()] || 0;
                          const bCardinality = tagCardinality[bClean.toLowerCase()] || 0;
                          return bCardinality - aCardinality;
                        });
                        
                        if (sortedTags.length === 0) {
                          return (
                            <span 
                              className="link-tag no-tag"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLinkClick(link);
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              #noTag
                            </span>
                          );
                        }
                        
                        return sortedTags.map((tag, idx) => {
                          const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
                          const tagColor = getTagColor(cleanTag, tagCardinality);
                          return (
                            <span 
                              key={idx} 
                              className="link-tag"
                              style={{ backgroundColor: tagColor, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLinkClick(link);
                              }}
                            >
                              {tag.startsWith('#') ? tag : `#${tag}`}
                            </span>
                          );
                        });
                      })()}
                    </div>
                    <button 
                      className="link-delete"
                      onClick={(e) => handleDelete(link.id, e)}
                    >
                      ×
                    </button>
                  </div>
                );
              });
            })()}
            </div>
          )}
        </div>
      </main>
      
      {/* Modal for tag rename confirmation */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={handleRenameCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                  Rename Tag
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  This will rename <strong>#{renameOldTag}</strong> to <strong>#{renameNewTag}</strong>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
                  {renameAffectedCount} {renameAffectedCount === 1 ? 'link' : 'links'} will be affected.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="modal-button cancel"
                  onClick={handleRenameCancel}
                  style={{
                    padding: '8px 16px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem'
                  }}
                >
                  Cancel
                </button>
                <button
                  className="modal-button confirm"
                  onClick={handleRenameTag}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--accent-color)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    fontWeight: 500
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for adding new links */}
      {showModal && (
        <div className="modal-overlay" onClick={handleModalCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <input
                ref={modalTitleRef}
                type="text"
                className="modal-input"
                value={modalInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  // Store the raw input value to preserve spaces
                  setModalInputValue(value);
                  
                  // Parse tags only (no title anymore)
                  const words = value.match(/\S+/g) || [];
                  const tagParts = [];
                  
                  words.forEach(word => {
                    if (word.startsWith('#')) {
                      tagParts.push(word);
                    }
                  });
                  
                  // Update parsed state for saving
                  setModalTags(tagParts.join(' '));
                  
                  // Update autocomplete with raw value
                  updateAutocomplete(value, e.target, 'modal');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modalUrl.trim()) {
                    e.preventDefault();
                    handleModalSave();
                  } else if (e.key === 'Escape') {
                    handleModalCancel();
                  } else if (showAutocomplete && autocompleteSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAutocompleteIndex(prev => 
                        prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setAutocompleteIndex(prev => prev > 0 ? prev - 1 : -1);
                    } else if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      const selectedIndex = autocompleteIndex >= 0 ? autocompleteIndex : 0;
                      const suggestion = autocompleteSuggestions[selectedIndex];
                      insertAutocompleteSuggestion(suggestion, modalInputValue, modalTitleRef.current, 'modal');
                    }
                  }
                }}
                placeholder="#tag1 #tag2"
                autoFocus
              />
              {showAutocomplete && autocompleteSuggestions.length > 0 && autocompleteInputType === 'modal' && (
                <div className="autocomplete-dropdown">
                  {autocompleteSuggestions.map((suggestion, index) => (
                    <div
                      key={suggestion}
                      className={`autocomplete-item ${index === autocompleteIndex ? 'selected' : ''}`}
                      onClick={() => {
                        insertAutocompleteSuggestion(suggestion, modalInputValue, modalTitleRef.current, 'modal');
                      }}
                      onMouseEnter={() => setAutocompleteIndex(index)}
                    >
                      #{suggestion}
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-url-hint">{getDomainFromUrl(modalUrl)}</div>
            </div>
          </div>
        </div>
      )}
      
      <div className="bottom-controls">
        <button className="help-toggle" onClick={() => setShowHelpModal(true)} title="Help">
          help
        </button>
        <span className="bottom-controls-separator">|</span>
        <button className="tag-case-toggle" onClick={toggleTagCaseMode} title={`Switch to ${tagCaseMode === 'camelCase' ? 'snake_case' : 'camelCase'}`}>
          {tagCaseMode}
        </button>
        <span className="bottom-controls-separator">|</span>
        <button className="theme-toggle" onClick={toggleTheme} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? 'dark mode' : 'light mode'}
        </button>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-content help-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-body">
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '20px', fontWeight: 600 }}>
                  Help & Features
                </h2>
                
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Adding Links
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Paste a URL in the search box at the top
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • A modal will open where you can add tags (e.g., <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>#tag1 #tag2</code>)
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • Press Enter to save the link
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Tags
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Click on a tag at the top to filter links by that tag
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • You can select multiple tags to narrow down results
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Drag and drop tags from the top onto link boxes to add them
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Click on a tag in a link box to edit that link
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • Tag colors indicate their frequency (bluer = more common, greyer = less common)
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Domain Tags
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Each link automatically gets a domain tag (e.g., <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>@example.com</code>)
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • Domain tags can be used for filtering just like regular tags
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Search & Filter
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Type in the search box to filter links by URL or tags
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Commands starting with <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>&gt;</code> won't filter links
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Commands
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '12px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Rename Tag:</strong>
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px', paddingLeft: '16px' }}>
                    Type <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>&gt; rename|#oldTag|#newTag</code> and press Enter
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px', paddingLeft: '16px' }}>
                    This will rename all instances of the old tag to the new tag across all your links
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Tag Case Modes
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Toggle between <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>camelCase</code> and <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>snake_case</code>
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • Changing the mode automatically converts all existing tags
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '12px', fontWeight: 500 }}>
                    Other Features
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Click on the center of a link box to open the URL
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Click the × button on a link to delete it
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>
                    • Links without tags are marked with <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '3px' }}>#noTag</code>
                  </p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    • All data is stored locally in your browser
                  </p>
                </div>

              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowHelpModal(false)}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--accent-color)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '0.9rem',
                    fontWeight: 500
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
