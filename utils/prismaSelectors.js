/**
 * Prisma query selectors
 * Standardizes field selection across database queries
 */

/**
 * Predefined Prisma select objects for consistent data fetching
 */
export const PrismaSelectors = {
  /**
   * Studio selectors
   */
  studio: {
    // Basic studio fields
    basic: {
      id: true,
      name: true,
      active: true
    },

    // Studio with phone numbers
    withPhones: {
      id: true,
      name: true,
      twilioPhone: true,
      zohoVoicePhone: true,
      active: true
    },

    // Full studio information
    full: {
      id: true,
      zohoId: true,
      name: true,
      managerName: true,
      twilioPhone: true,
      zohoVoicePhone: true,
      callPhone: true,
      active: true
    },

    // Studio for mapping purposes
    mapping: {
      id: true,
      name: true,
      twilioPhone: true,
      zohoVoicePhone: true
    }
  },

  /**
   * Message selectors
   */
  message: {
    // Basic message fields
    basic: {
      id: true,
      fromNumber: true,
      toNumber: true,
      message: true,
      createdAt: true,
      provider: true
    },

    // Message with studio information
    withStudio: {
      id: true,
      fromNumber: true,
      toNumber: true,
      message: true,
      createdAt: true,
      provider: true,
      twilioMessageId: true,
      zohoMessageId: true,
      isWelcomeMessage: true,
      isFollowUpMessage: true,
      Studio: {
        select: {
          id: true,
          name: true,
          twilioPhone: true,
          zohoVoicePhone: true
        }
      }
    },

    // Full message information
    full: {
      id: true,
      studioId: true,
      contactId: true,
      fromNumber: true,
      toNumber: true,
      message: true,
      provider: true,
      twilioMessageId: true,
      zohoMessageId: true,
      isWelcomeMessage: true,
      isFollowUpMessage: true,
      createdAt: true,
      updatedAt: true,
      Studio: {
        select: {
          id: true,
          name: true,
          twilioPhone: true,
          zohoVoicePhone: true
        }
      }
    }
  },

  /**
   * Account selectors
   */
  account: {
    // Basic account fields
    basic: {
      id: true,
      platform: true,
      clientId: true,
      active: true
    },

    // Account with credentials (sensitive)
    withCredentials: {
      id: true,
      platform: true,
      clientId: true,
      clientSecret: true,
      accessToken: true,
      refreshToken: true,
      expiresIn: true,
      active: true,
      updatedAt: true
    },

    // Account with studio relationships
    withStudios: {
      id: true,
      platform: true,
      clientId: true,
      active: true,
      StudioAccounts: {
        include: {
          Studio: {
            select: {
              id: true,
              name: true,
              active: true
            }
          }
        }
      }
    }
  },

  /**
   * StudioAccount selectors
   */
  studioAccount: {
    // Basic studio account relationship
    basic: {
      studioId: true,
      accountId: true
    },

    // With account details
    withAccount: {
      studioId: true,
      accountId: true,
      Account: {
        select: {
          id: true,
          platform: true,
          clientId: true,
          clientSecret: true,
          accessToken: true,
          refreshToken: true,
          expiresIn: true,
          active: true,
          updatedAt: true
        }
      }
    },

    // With studio details
    withStudio: {
      studioId: true,
      accountId: true,
      Studio: {
        select: {
          id: true,
          name: true,
          twilioPhone: true,
          zohoVoicePhone: true,
          active: true
        }
      }
    },

    // Full relationship with both studio and account
    full: {
      studioId: true,
      accountId: true,
      Studio: {
        select: {
          id: true,
          name: true,
          twilioPhone: true,
          zohoVoicePhone: true,
          active: true
        }
      },
      Account: {
        select: {
          id: true,
          platform: true,
          clientId: true,
          clientSecret: true,
          accessToken: true,
          refreshToken: true,
          expiresIn: true,
          active: true,
          updatedAt: true
        }
      }
    }
  }
};

/**
 * Helper functions for dynamic selectors
 */
export const SelectorHelpers = {
  /**
   * Create a studio selector with optional phone fields
   * @param {boolean} includePhones - Whether to include phone number fields
   * @param {boolean} includeActive - Whether to include active field
   * @returns {Object} Studio selector
   */
  studio(includePhones = true, includeActive = true) {
    const selector = {
      id: true,
      name: true
    };

    if (includePhones) {
      selector.twilioPhone = true;
      selector.zohoVoicePhone = true;
    }

    if (includeActive) {
      selector.active = true;
    }

    return selector;
  },

  /**
   * Create a message selector with optional related data
   * @param {boolean} includeStudio - Whether to include studio data
   * @param {boolean} includeProviderIds - Whether to include provider-specific IDs
   * @returns {Object} Message selector
   */
  message(includeStudio = false, includeProviderIds = true) {
    const selector = {
      id: true,
      fromNumber: true,
      toNumber: true,
      message: true,
      createdAt: true,
      provider: true
    };

    if (includeProviderIds) {
      selector.twilioMessageId = true;
      selector.zohoMessageId = true;
      selector.isWelcomeMessage = true;
      selector.isFollowUpMessage = true;
    }

    if (includeStudio) {
      selector.Studio = {
        select: PrismaSelectors.studio.withPhones
      };
    }

    return selector;
  },

  /**
   * Create an account selector with optional sensitive fields
   * @param {boolean} includeSensitive - Whether to include sensitive fields
   * @param {boolean} includeStudios - Whether to include studio relationships
   * @returns {Object} Account selector
   */
  account(includeSensitive = false, includeStudios = false) {
    const selector = {
      id: true,
      platform: true,
      clientId: true,
      active: true
    };

    if (includeSensitive) {
      selector.clientSecret = true;
      selector.accessToken = true;
      selector.refreshToken = true;
      selector.expiresIn = true;
      selector.updatedAt = true;
    }

    if (includeStudios) {
      selector.StudioAccounts = {
        include: {
          Studio: {
            select: PrismaSelectors.studio.basic
          }
        }
      };
    }

    return selector;
  }
};

/**
 * Common query patterns
 */
export const CommonQueries = {
  /**
   * Standard where clause for active studios
   */
  activeStudios: {
    where: { active: true }
  },

  /**
   * Standard where clause for active accounts
   */
  activeAccounts: {
    where: { active: true }
  },

  /**
   * Order by creation date (newest first)
   */
  orderByNewest: {
    orderBy: { createdAt: 'desc' }
  },

  /**
   * Order by creation date (oldest first)
   */
  orderByOldest: {
    orderBy: { createdAt: 'asc' }
  },

  /**
   * Standard pagination
   * @param {number} page - Page number (0-based)
   * @param {number} pageSize - Number of items per page
   * @returns {Object} Pagination object
   */
  paginate(page = 0, pageSize = 50) {
    return {
      skip: page * pageSize,
      take: pageSize
    };
  }
};

// Legacy exports for backward compatibility
export const studioFieldsSelect = PrismaSelectors.studio.full;