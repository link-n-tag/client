import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const STORAGE_KEY = 'link-tag-storage';

function App() {
  const [links, setLinks] = useState([]);
  const [editingLinkId, setEditingLinkId] = useState(null); // Track which link is being edited
  const [showModal, setShowModal] = useState(false);
  const [modalUrl, setModalUrl] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [modalTags, setModalTags] = useState('');
  const [modalInputValue, setModalInputValue] = useState('');
  const [fetchingTitle, setFetchingTitle] = useState(false);
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
  const modalTitleRef = useRef(null);

  // Fetch page title from URL
  const fetchPageTitle = useCallback(async (url) => {
    try {
      // Normalize URL to ensure we're fetching the exact page
      let targetUrl = url.trim();
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      
      // Try multiple CORS proxy services as fallbacks
      const proxyServices = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      ];
      
      let html = null;
      let lastError = null;
      
      // Try each proxy service until one works
      for (const proxyUrl of proxyServices) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
              'Accept': 'text/html',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          html = await response.text();
          
          // Validate that we got actual HTML content (not an error page)
          if (html && html.length > 100 && html.includes('<title')) {
            break; // Success, exit loop
          }
        } catch (error) {
          lastError = error;
          // Continue to next proxy service
          continue;
        }
      }
      
      if (!html) {
        throw lastError || new Error('All proxy services failed');
      }
      
      // Try multiple methods to extract title (in order of preference)
      let title = null;
      
      // 1. Try Open Graph title (most reliable for specific pages)
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
      if (ogTitleMatch && ogTitleMatch[1]) {
        title = ogTitleMatch[1];
      }
      
      // 2. Try Twitter card title
      if (!title) {
        const twitterTitleMatch = html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);
        if (twitterTitleMatch && twitterTitleMatch[1]) {
          title = twitterTitleMatch[1];
        }
      }
      
      // 3. Try standard HTML title tag
      if (!title) {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1];
        }
      }
      
      if (title) {
        // Clean up the title: decode HTML entities, trim whitespace
        title = title
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&#x27;/g, "'")
          .replace(/&#x2F;/g, '/')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Limit title length
        if (title.length > 100) {
          title = title.substring(0, 100) + '...';
        }
        
        return title;
      }
    } catch (error) {
      // CORS or other errors - silently fail and return null
      // The user can still manually enter the title
      console.debug('Could not fetch page title:', error.message);
    }
    return null;
  }, []);

  // Handle paste event to open modal
  const handlePaste = useCallback(async (e) => {
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    const urlPattern = /^https?:\/\/.+/i;
    
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
        setModalTitle(existingLink.title);
        setModalTags(tagsDisplay);
        setModalInputValue(`${existingLink.title}${tagsDisplay ? ' ' + tagsDisplay : ''}`);
        setShowModal(true);
        return;
      }
      
      // Open modal with URL (new link)
      setEditingLinkId(null); // Ensure we're creating, not editing
      setModalUrl(url);
      setModalTitle('');
      setModalTags('');
      setModalInputValue('');
      setShowModal(true);
      setFetchingTitle(true);
      
      // Fetch title automatically
      fetchPageTitle(url).then(title => {
        setFetchingTitle(false);
        if (title) {
          setModalTitle(title);
          setModalInputValue(title);
        }
      }).catch(() => {
        setFetchingTitle(false);
      });
    }
  }, [links, fetchPageTitle]);

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
    if (!modalUrl.trim() || !modalTitle.trim()) {
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
              title: modalTitle.trim(),
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
        title: modalTitle.trim(),
        url: modalUrl.trim(),
        tags: normalizedTags || '',
        created_at: new Date().toISOString()
      };
      saveLinks([...links, newLink]);
    }
    
    setShowModal(false);
    setModalUrl('');
    setModalTitle('');
    setModalTags('');
    setModalInputValue('');
  };
  
  // Handle modal cancel
  const handleModalCancel = () => {
    setShowModal(false);
    setModalUrl('');
    setModalTitle('');
    setModalTags('');
    setModalInputValue('');
    setFetchingTitle(false);
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
      
      // Parse the combined input to separate title and tags
      const words = newText.match(/\S+/g) || [];
      const titleParts = [];
      const tagParts = [];
      
      words.forEach(word => {
        if (word.startsWith('#')) {
          tagParts.push(word);
        } else {
          titleParts.push(word);
        }
      });
      
      setModalTitle(titleParts.join(' '));
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
    const inputValue = `${link.title}${tagsDisplay ? ' ' + tagsDisplay : ''}`;
    setEditingLinkId(link.id);
    setModalUrl(link.url);
    setModalTitle(link.title);
    setModalTags(tagsDisplay);
    setModalInputValue(inputValue);
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

  // Get domain tag from a URL
  const getFaviconUrl = (url) => {
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
    
    // Interpolate between grey (#888) and blue (#7aa3a3)
    // Grey: rgb(136, 136, 136)
    // Blue: rgb(122, 163, 163)
    const grey = { r: 136, g: 136, b: 136 };
    const blue = { r: 122, g: 163, b: 163 };
    
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
    
    // Filter by search term (searches in title and tags)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      const titleMatch = link.title.toLowerCase().includes(searchLower);
      
      // Check tags
      const linkTags = link.tags ? link.tags.split(',').map(t => t.trim().toLowerCase()) : [];
      const domainTag = getDomainTag(link.url);
      if (domainTag) {
        linkTags.push(domainTag.toLowerCase());
      }
      const tagMatch = linkTags.some(tag => tag.includes(searchLower));
      
      // Check URL
      const urlMatch = link.url.toLowerCase().includes(searchLower);
      
      if (!titleMatch && !tagMatch && !urlMatch) {
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
                    const tagColor = !isNoTag && !isDomainTag ? getTagColor(tag, tagCardinality) : undefined;
                    return (
                      <button
                        key={tag}
                        className={`tag-filter active ${isNoTag ? 'no-tag-reserved' : ''} ${isDomainTag ? 'domain-tag' : ''}`}
                        style={tagColor ? { color: tagColor } : undefined}
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
                  const tagColor = !isNoTag && !isDomainTag ? getTagColor(tag, tagCardinality) : undefined;
                  return (
                    <button
                      key={tag}
                      className={`tag-filter ${isSelected ? 'active' : ''} ${draggedTag === tag ? 'dragging' : ''} ${isNoTag ? 'no-tag-reserved' : ''} ${isDomainTag ? 'domain-tag' : ''}`}
                      style={tagColor ? { color: tagColor } : undefined}
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
                // If Enter is pressed and it's a URL, open modal
                if (e.key === 'Enter') {
                  const urlPattern = /^https?:\/\/.+/i;
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
                      setModalTitle(existingLink.title);
                      setModalTags(tagsDisplay);
                      setShowModal(true);
                      setSearchTerm('');
                    } else {
                      setEditingLinkId(null);
                      setModalUrl(url);
                      setModalTitle('');
                      setModalTags('');
                      setShowModal(true);
                      setFetchingTitle(true);
                      setSearchTerm('');
                      
                      fetchPageTitle(url).then(title => {
                        setFetchingTitle(false);
                        if (title) {
                          setModalTitle(title);
                        }
                      }).catch(() => {
                        setFetchingTitle(false);
                      });
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
                    onClick={() => handleLinkClick(link)}
                    onDragOver={(e) => handleLinkDragOver(e, link.id)}
                    onDragLeave={handleLinkDragLeave}
                    onDrop={(e) => handleLinkDrop(e, link.id)}
                  >
                    <img 
                      src={getFaviconUrl(link.url)} 
                      alt="" 
                      className="link-favicon"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <a 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="link-url"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {link.title}
                    </a>
                    <div className="link-item-tags">
                      {(() => {
                        const domainTag = getDomainTag(link.url);
                        const regularTags = link.tags && link.tags.trim() 
                          ? link.tags.split(',').map(t => t.trim()).filter(t => t)
                          : [];
                        
                        if (!domainTag && regularTags.length === 0) {
                          return <span className="link-tag no-tag">#noTag</span>;
                        }
                        
                        // Sort regular tags by cardinality (highest to lowest)
                        const sortedTags = regularTags.sort((a, b) => {
                          const aClean = a.startsWith('#') ? a.slice(1) : a;
                          const bClean = b.startsWith('#') ? b.slice(1) : b;
                          const aCardinality = tagCardinality[aClean.toLowerCase()] || 0;
                          const bCardinality = tagCardinality[bClean.toLowerCase()] || 0;
                          return bCardinality - aCardinality;
                        });
                        
                        return (
                          <>
                            {domainTag && (
                              <span className="link-tag domain-tag">{domainTag}</span>
                            )}
                            {sortedTags.map((tag, idx) => {
                              const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag;
                              const tagColor = getTagColor(cleanTag, tagCardinality);
                              return (
                                <span 
                                  key={idx} 
                                  className="link-tag"
                                  style={{ color: tagColor }}
                                >
                                  {tag.startsWith('#') ? tag : `#${tag}`}
                                </span>
                              );
                            })}
                          </>
                        );
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
                  
                  // Parse title and tags for state (used when saving)
                  const words = value.match(/\S+/g) || [];
                  const titleParts = [];
                  const tagParts = [];
                  
                  words.forEach(word => {
                    if (word.startsWith('#')) {
                      tagParts.push(word);
                    } else {
                      titleParts.push(word);
                    }
                  });
                  
                  // Update parsed state for saving
                  setModalTitle(titleParts.join(' '));
                  setModalTags(tagParts.join(' '));
                  
                  // Update autocomplete with raw value
                  updateAutocomplete(value, e.target, 'modal');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modalUrl.trim() && modalTitle.trim()) {
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
                placeholder={fetchingTitle && !editingLinkId ? "fetching title..." : "title here #tag1 #tag2"}
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
        <button className="tag-case-toggle" onClick={toggleTagCaseMode} title={`Switch to ${tagCaseMode === 'camelCase' ? 'snake_case' : 'camelCase'}`}>
          {tagCaseMode}
        </button>
        <span className="bottom-controls-separator">|</span>
        <button className="theme-toggle" onClick={toggleTheme} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? 'dark mode' : 'light mode'}
        </button>
      </div>
    </div>
  );
}

export default App;
