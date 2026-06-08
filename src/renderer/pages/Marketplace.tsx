import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Store,
  Download,
  Search,
  CheckCircle2,
  Loader2,
  Star,
  ArrowLeftRight,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';

interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  author: string;
  repo: string;
  category: string;
  subcategory?: string;
  stars: number;
  installed: boolean;
  dependencies?: string[];
  version?: string;
  replaces?: string[];
  installFolder?: string;
}

// ─── MASSIVE RESOURCE CATALOG ────────────────────────────────────────────────
const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE / LIBRARIES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_lib', name: 'ox_lib', description: 'Shared function library with UI elements, zones, points, callbacks, and more. Required by most modern resources.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_lib', category: 'Core', stars: 820, installed: false, version: '3.20.0', installFolder: '[core]',
  },
  {
    id: 'oxmysql', name: 'oxmysql', description: 'MySQL/MariaDB wrapper using node-mysql2. The standard database solution for FiveM.',
    author: 'overextended', repo: 'https://github.com/overextended/oxmysql', category: 'Core', stars: 520, installed: false, version: '2.7.6', installFolder: '[core]',
  },
  {
    id: 'mysql-async', name: 'mysql-async', description: 'Legacy MySQL wrapper for FiveM. Use oxmysql for new projects.',
    author: 'brouznouf', repo: 'https://github.com/brouznouf/fivem-mysql-async', category: 'Core', stars: 310, installed: false, replaces: ['oxmysql'], installFolder: '[core]',
  },
  {
    id: 'PolyZone', name: 'PolyZone', description: 'Zone library with polygon, circle, and box support for area detection and triggers.',
    author: 'mkafrin', repo: 'https://github.com/mkafrin/PolyZone', category: 'Core', stars: 310, installed: false, installFolder: '[core]',
  },
  {
    id: 'ox_core', name: 'ox_core', description: 'A modern FiveM framework by Overextended. Lightweight alternative to ESX/QBCore.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_core', category: 'Framework', stars: 400, installed: false, version: '0.25.0', dependencies: ['ox_lib', 'oxmysql'], replaces: ['es_extended', 'qb-core'], installFolder: '[framework]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAMEWORKS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-core', name: 'qb-core', description: 'QBCore Framework — modern, feature-rich FiveM framework for RP servers with huge community.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-core', category: 'Framework', stars: 1250, installed: false, replaces: ['es_extended', 'ox_core'], installFolder: '[framework]',
  },
  {
    id: 'es_extended', name: 'es_extended', description: 'ESX Legacy — the most widely used FiveM RP framework with massive community support and resources.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_core', category: 'Framework', stars: 950, installed: false, replaces: ['qb-core', 'ox_core'], installFolder: '[framework]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'pma-voice', name: 'pma-voice', description: 'Full voice system with proximity chat, radio channels, phone calls, and submersion effects.',
    author: 'AvarianKnight', repo: 'https://github.com/AvarianKnight/pma-voice', category: 'Voice', stars: 420, installed: false, version: '5.0.1', replaces: ['mumble-voip', 'tokovoip'], installFolder: '[voice]',
  },
  {
    id: 'saltychat', name: 'saltychat-fivem', description: 'Salty Chat plugin for FiveM — TeamSpeak-based voice with 3D audio and radio simulation.',
    author: 'v10networkscom', repo: 'https://github.com/v10networkscom/saltychat-fivem', category: 'Voice', stars: 180, installed: false, replaces: ['pma-voice'], installFolder: '[voice]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHONE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'npwd', name: 'npwd', description: 'New Phone Who Dis — React-based in-game smartphone with Twitter, messages, contacts, camera, and more.',
    author: 'project-error', repo: 'https://github.com/project-error/npwd', category: 'Phone', stars: 680, installed: false, replaces: ['qb-phone', 'gcphone', 'qs-smartphone'], installFolder: '[phone]',
  },
  {
    id: 'qb-phone', name: 'qb-phone', description: 'QBCore phone with messages, Twitter, banking app, contacts, and job center integration.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-phone', category: 'Phone', stars: 200, installed: false, dependencies: ['qb-core'], replaces: ['npwd', 'gcphone'], installFolder: '[phone]',
  },
  {
    id: 'gcphone', name: 'gcphone', description: 'Classic GCPhone — lightweight in-game phone with Twitter, messages, bank, and contacts.',
    author: 'GHMatti', repo: 'https://github.com/GHMatti/FiveM-GCPhone', category: 'Phone', stars: 150, installed: false, replaces: ['npwd', 'qb-phone'], installFolder: '[phone]',
  },
  {
    id: 'lb-phone', name: 'lb-phone (free)', description: 'LB Phone free/community edition — modern phone UI with camera, gallery, messages.',
    author: 'loljoshie', repo: 'https://github.com/loljoshie/lb-phone', category: 'Phone', stars: 120, installed: false, replaces: ['npwd', 'qb-phone', 'gcphone'], installFolder: '[phone]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_inventory', name: 'ox_inventory', description: 'Feature-rich inventory with crafting, shops, stashes, weapon attachments, and item metadata.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_inventory', category: 'Inventory', stars: 730, installed: false, version: '2.37.0', dependencies: ['ox_lib', 'oxmysql'], replaces: ['qb-inventory', 'qs-inventory', 'lj-inventory'], installFolder: '[inventory]',
  },
  {
    id: 'qb-inventory', name: 'qb-inventory', description: 'QBCore inventory system with drag-and-drop, hotbar, crafting, and shop integration.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-inventory', category: 'Inventory', stars: 320, installed: false, dependencies: ['qb-core'], replaces: ['ox_inventory', 'lj-inventory'], installFolder: '[inventory]',
  },
  {
    id: 'qs-inventory', name: 'qs-inventory', description: 'Quasar Inventory — sleek UI with weight system, crafting, and item management.',
    author: 'quasar-store', repo: 'https://github.com/quasar-store/qs-inventory', category: 'Inventory', stars: 140, installed: false, replaces: ['ox_inventory', 'qb-inventory'], installFolder: '[inventory]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHARACTER / APPEARANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'illenium-appearance', name: 'illenium-appearance', description: 'Modern character creator and clothing system with intuitive UI, outfits, and barber support.',
    author: 'iLLeniumStudios', repo: 'https://github.com/iLLeniumStudios/illenium-appearance', category: 'Character', stars: 450, installed: false, dependencies: ['ox_lib'], replaces: ['fivem-appearance', 'qb-clothing', 'esx_skin'], installFolder: '[character]',
  },
  {
    id: 'fivem-appearance', name: 'fivem-appearance', description: 'Standalone character creator with full body customization, tattoos, and clothing management.',
    author: 'pedr0fontoura', repo: 'https://github.com/pedr0fontoura/fivem-appearance', category: 'Character', stars: 380, installed: false, replaces: ['illenium-appearance', 'qb-clothing'], installFolder: '[character]',
  },
  {
    id: 'qb-clothing', name: 'qb-clothing', description: 'QBCore clothing and character creation with outfit saving and wardrobe system.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-clothing', category: 'Character', stars: 120, installed: false, dependencies: ['qb-core'], replaces: ['illenium-appearance', 'fivem-appearance'], installFolder: '[character]',
  },
  {
    id: 'esx_skin', name: 'esx_skin', description: 'ESX character customization — classic skin/clothing system for ESX servers.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_skin', category: 'Character', stars: 90, installed: false, dependencies: ['es_extended'], replaces: ['illenium-appearance', 'fivem-appearance'], installFolder: '[character]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HUD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_hud', name: 'ox_hud', description: 'Overextended HUD — minimal, clean display for health, armor, hunger, thirst, and vehicle speed.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_hud', category: 'HUD', stars: 160, installed: false, dependencies: ['ox_lib'], replaces: ['qb-hud', 'ps-hud', 'esx_hud'], installFolder: '[hud]',
  },
  {
    id: 'qb-hud', name: 'qb-hud', description: 'QBCore HUD with health, armor, hunger, thirst, stress, vehicle info, and compass.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-hud', category: 'HUD', stars: 180, installed: false, dependencies: ['qb-core'], replaces: ['ox_hud', 'ps-hud'], installFolder: '[hud]',
  },
  {
    id: 'ps-hud', name: 'ps-hud', description: 'Project Sloth HUD — modern redesign of qb-hud with cinematic bars and clean icons.',
    author: 'Project-Sloth', repo: 'https://github.com/Project-Sloth/ps-hud', category: 'HUD', stars: 220, installed: false, dependencies: ['qb-core'], replaces: ['qb-hud', 'ox_hud'], installFolder: '[hud]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TARGETING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_target', name: 'ox_target', description: 'Performant targeting system for interacting with entities, players, vehicles, and zones.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_target', category: 'Interaction', stars: 360, installed: false, version: '1.16.0', dependencies: ['ox_lib'], replaces: ['qb-target', 'bt-target'], installFolder: '[core]',
  },
  {
    id: 'qb-target', name: 'qb-target', description: 'QBCore targeting — eye-based interaction system for entities, zones, and models.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-target', category: 'Interaction', stars: 190, installed: false, dependencies: ['qb-core'], replaces: ['ox_target', 'bt-target'], installFolder: '[core]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ECONOMY / BANKING
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'renewed-banking', name: 'Renewed-Banking', description: 'Full banking system with ATMs, bank accounts, transfers, transaction history, and shared accounts.',
    author: 'Renewed-Scripts', repo: 'https://github.com/Renewed-Scripts/Renewed-Banking', category: 'Economy', stars: 280, installed: false, dependencies: ['ox_lib', 'oxmysql'], replaces: ['qb-banking', 'esx_banking'], installFolder: '[economy]',
  },
  {
    id: 'qb-banking', name: 'qb-banking', description: 'QBCore banking — ATMs and bank counters with savings accounts, transfers, and statements.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-banking', category: 'Economy', stars: 110, installed: false, dependencies: ['qb-core'], replaces: ['renewed-banking'], installFolder: '[economy]',
  },
  {
    id: 'okokBanking', name: 'okokBanking', description: 'OKOK Banking — clean UI for bank accounts, invoices, and transactions.',
    author: 'okok-scripts', repo: 'https://github.com/okok-scripts/okokBanking', category: 'Economy', stars: 85, installed: false, replaces: ['renewed-banking', 'qb-banking'], installFolder: '[economy]',
  },
  {
    id: 'qb-shops', name: 'qb-shops', description: 'QBCore shop system — configurable stores, 24/7 shops, and weapon shops with item management.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-shops', category: 'Economy', stars: 95, installed: false, dependencies: ['qb-core'], installFolder: '[economy]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOBS — POLICE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-policejob', name: 'qb-policejob', description: 'QBCore police job with evidence, fingerprints, radar gun, spike strips, and jail integration.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-policejob', category: 'Jobs', subcategory: 'Police', stars: 200, installed: false, dependencies: ['qb-core'], replaces: ['esx_policejob'], installFolder: '[jobs]',
  },
  {
    id: 'esx_policejob', name: 'esx_policejob', description: 'ESX police job with armory, evidence locker, warrants, fines, and vehicle impound.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_policejob', category: 'Jobs', subcategory: 'Police', stars: 140, installed: false, dependencies: ['es_extended'], replaces: ['qb-policejob'], installFolder: '[jobs]',
  },
  {
    id: 'ps-mdt', name: 'ps-mdt', description: 'Project Sloth MDT — police/EMS mobile data terminal with warrants, BOLO, reports, and profiles.',
    author: 'Project-Sloth', repo: 'https://github.com/Project-Sloth/ps-mdt', category: 'Jobs', subcategory: 'Police', stars: 340, installed: false, dependencies: ['ox_lib'], installFolder: '[police]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOBS — EMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-ambulancejob', name: 'qb-ambulancejob', description: 'QBCore EMS job with stretchers, bed check-in, healing items, and hospital interior.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-ambulancejob', category: 'Jobs', subcategory: 'EMS', stars: 130, installed: false, dependencies: ['qb-core'], replaces: ['esx_ambulancejob'], installFolder: '[jobs]',
  },
  {
    id: 'esx_ambulancejob', name: 'esx_ambulancejob', description: 'ESX ambulance/EMS job with hospital, revive, and medical treatment system.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_ambulancejob', category: 'Jobs', subcategory: 'EMS', stars: 95, installed: false, dependencies: ['es_extended'], replaces: ['qb-ambulancejob'], installFolder: '[jobs]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOBS — MECHANIC
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-mechanicjob', name: 'qb-mechanicjob', description: 'QBCore mechanic with vehicle repair, part replacement, tuning, and custom paint.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-mechanicjob', category: 'Jobs', subcategory: 'Mechanic', stars: 85, installed: false, dependencies: ['qb-core'], replaces: ['esx_mechanicjob'], installFolder: '[jobs]',
  },
  {
    id: 'esx_mechanicjob', name: 'esx_mechanicjob', description: 'ESX mechanic job with vehicle repair, tow truck, and parts crafting.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_mechanicjob', category: 'Jobs', subcategory: 'Mechanic', stars: 70, installed: false, dependencies: ['es_extended'], replaces: ['qb-mechanicjob'], installFolder: '[jobs]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JOBS — OTHER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-taxijob', name: 'qb-taxijob', description: 'QBCore taxi/Uber job with meter, NPC dispatch, and fare tracking.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-taxijob', category: 'Jobs', subcategory: 'Other', stars: 60, installed: false, dependencies: ['qb-core'], installFolder: '[jobs]',
  },
  {
    id: 'qb-truckerjob', name: 'qb-truckerjob', description: 'QBCore trucker job with delivery routes, cargo types, and payout scaling.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-truckerjob', category: 'Jobs', subcategory: 'Other', stars: 70, installed: false, dependencies: ['qb-core'], installFolder: '[jobs]',
  },
  {
    id: 'qb-busjob', name: 'qb-busjob', description: 'QBCore bus driver job with routes, NPC passengers, and payout system.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-busjob', category: 'Jobs', subcategory: 'Other', stars: 40, installed: false, dependencies: ['qb-core'], installFolder: '[jobs]',
  },
  {
    id: 'esx_jobs', name: 'esx_jobs', description: 'ESX generic jobs package — fisherman, lumberjack, miner, slaughterer, and more.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_jobs', category: 'Jobs', subcategory: 'Other', stars: 80, installed: false, dependencies: ['es_extended'], installFolder: '[jobs]',
  },
  {
    id: 'pickle-farming', name: 'pickle_farming', description: 'Farming system with planting, watering, harvesting, selling — great for RP economy.',
    author: 'PickleModifications', repo: 'https://github.com/PickleModifications/pickle_farming', category: 'Jobs', subcategory: 'Other', stars: 55, installed: false, installFolder: '[jobs]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VEHICLES / GARAGES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-garages', name: 'qb-garages', description: 'QBCore garage system with vehicle storage, impound lot, and public/job parking.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-garages', category: 'Vehicles', stars: 130, installed: false, dependencies: ['qb-core'], replaces: ['esx_garage', 'jg-advancedgarages'], installFolder: '[vehicles]',
  },
  {
    id: 'qb-vehicleshop', name: 'qb-vehicleshop', description: 'QBCore vehicle dealership with test drives, financing, and employee management.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-vehicleshop', category: 'Vehicles', stars: 110, installed: false, dependencies: ['qb-core'], replaces: ['esx_vehicleshop'], installFolder: '[vehicles]',
  },
  {
    id: 'qb-vehiclekeys', name: 'qb-vehiclekeys', description: 'QBCore vehicle key system — lockpicking, hotwiring, key sharing, and engine toggle.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-vehiclekeys', category: 'Vehicles', stars: 90, installed: false, dependencies: ['qb-core'], installFolder: '[vehicles]',
  },
  {
    id: 'esx_vehicleshop', name: 'esx_vehicleshop', description: 'ESX vehicle dealer with buy/sell, test drive, and resale system.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_vehicleshop', category: 'Vehicles', stars: 75, installed: false, dependencies: ['es_extended'], replaces: ['qb-vehicleshop'], installFolder: '[vehicles]',
  },
  {
    id: 'wasabi_carlock', name: 'wasabi_carlock', description: 'Standalone vehicle lock system — lock/unlock, alarm, hotwire, and lockpick integration.',
    author: 'wasaborern', repo: 'https://github.com/wasaborern/wasabi_carlock', category: 'Vehicles', stars: 60, installed: false, installFolder: '[vehicles]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOUSING / PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-houses', name: 'qb-houses', description: 'QBCore housing with buyable properties, stash, wardrobe, garage, and key sharing.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-houses', category: 'Housing', stars: 140, installed: false, dependencies: ['qb-core'], replaces: ['esx_property'], installFolder: '[housing]',
  },
  {
    id: 'esx_property', name: 'esx_property', description: 'ESX property system — buy/rent apartments and houses with stash and wardrobe.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_property', category: 'Housing', stars: 60, installed: false, dependencies: ['es_extended'], replaces: ['qb-houses'], installFolder: '[housing]',
  },
  {
    id: 'ps-housing', name: 'ps-housing', description: 'Project Sloth housing — modern shell-based housing with furniture placement and decorating.',
    author: 'Project-Sloth', repo: 'https://github.com/Project-Sloth/ps-housing', category: 'Housing', stars: 250, installed: false, dependencies: ['ox_lib'], replaces: ['qb-houses', 'esx_property'], installFolder: '[housing]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN TOOLS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'vMenu', name: 'vMenu', description: 'Server-side trainer/admin menu — teleport, vehicles, weather, player management, and permissions.',
    author: 'TomGrobbe', repo: 'https://github.com/TomGrobbe/vMenu', category: 'Admin', stars: 620, installed: false, installFolder: '[admin]',
  },
  {
    id: 'EasyAdmin', name: 'EasyAdmin', description: 'Lightweight admin system with kick, ban, spectate, teleport, and permission management.',
    author: 'Flaviocalixto', repo: 'https://github.com/Flaviocalixto/EasyAdmin', category: 'Admin', stars: 280, installed: false, installFolder: '[admin]',
  },
  {
    id: 'qb-admin', name: 'qb-adminmenu', description: 'QBCore admin menu with player management, vehicle spawning, teleport, and server tools.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-adminmenu', category: 'Admin', stars: 90, installed: false, dependencies: ['qb-core'], installFolder: '[admin]',
  },
  {
    id: 'Starter_Admin', name: 'Starter_Admin', description: 'Simple admin panel with ban, kick, warn, teleport, and player info. Great for new servers.',
    author: 'starter-scripts', repo: 'https://github.com/starter-scripts/Starter_Admin', category: 'Admin', stars: 45, installed: false, installFolder: '[admin]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY / DOORLOCKS / MISC
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_doorlock', name: 'ox_doorlock', description: 'Door management with lockpicking, authorized access, auto-lock, and admin controls.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_doorlock', category: 'Utility', stars: 200, installed: false, version: '1.8.0', dependencies: ['ox_lib', 'oxmysql'], installFolder: '[utility]',
  },
  {
    id: 'qb-doorlock', name: 'qb-doorlock', description: 'QBCore door lock system with items, jobs, and gang authorization.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-doorlock', category: 'Utility', stars: 80, installed: false, dependencies: ['qb-core'], replaces: ['ox_doorlock'], installFolder: '[utility]',
  },
  {
    id: 'qb-lock', name: 'qb-lock', description: 'QBCore lockpick minigame — skill-based lockpicking for vehicles and doors.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-lock', category: 'Utility', stars: 55, installed: false, installFolder: '[utility]',
  },
  {
    id: 'ps-dispatch', name: 'ps-dispatch', description: 'Project Sloth dispatch — 911 alerts for police/EMS with location, blips, and descriptions.',
    author: 'Project-Sloth', repo: 'https://github.com/Project-Sloth/ps-dispatch', category: 'Utility', stars: 190, installed: false, dependencies: ['ox_lib'], installFolder: '[utility]',
  },
  {
    id: 'progressbar', name: 'progressbar', description: 'Simple progress bar for actions like crafting, repairing, and searching. Universal compatibility.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/progressbar', category: 'Utility', stars: 70, installed: false, installFolder: '[utility]',
  },
  {
    id: 'rpemotes', name: 'rpemotes', description: 'Massive emote menu with 400+ animations, shared emotes, prop emotes, and walk styles.',
    author: 'TayMcKenzieNZ', repo: 'https://github.com/TayMcKenzieNZ/rpemotes', category: 'Utility', stars: 350, installed: false, installFolder: '[utility]',
  },
  {
    id: 'scully_emotemenu', name: 'scully_emotemenu', description: 'Modern emote menu with search, favorites, walk styles, and prop management.',
    author: 'Scully049', repo: 'https://github.com/Scully049/scully_emotemenu', category: 'Utility', stars: 220, installed: false, dependencies: ['ox_lib'], replaces: ['rpemotes'], installFolder: '[utility]',
  },
  {
    id: 'interact-sound', name: 'interact-sound', description: 'Play custom sound files client-side — used by many resources for notifications and effects.',
    author: 'plunkettscoding', repo: 'https://github.com/MonkeyWhisper/interact-sound', category: 'Utility', stars: 60, installed: false, installFolder: '[utility]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER / ENVIRONMENT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-weathersync', name: 'qb-weathersync', description: 'Dynamic weather and time sync across all players with admin override and forecast.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-weathersync', category: 'Environment', stars: 80, installed: false, installFolder: '[environment]',
  },
  {
    id: 'cd_easytime', name: 'cd_easytime', description: 'Simple time and weather sync with commands for admins. Lightweight and standalone.',
    author: 'codesign-dev', repo: 'https://github.com/codesign-dev/cd_easytime', category: 'Environment', stars: 45, installed: false, replaces: ['qb-weathersync'], installFolder: '[environment]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTICHAR / SPAWN
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-multicharacter', name: 'qb-multicharacter', description: 'QBCore multi-character selection with create/delete slots and character preview.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-multicharacter', category: 'Spawn', stars: 130, installed: false, dependencies: ['qb-core'], installFolder: '[spawn]',
  },
  {
    id: 'qb-spawn', name: 'qb-spawn', description: 'QBCore spawn selector — choose spawn location (last position, house, apartment, job).',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-spawn', category: 'Spawn', stars: 60, installed: false, dependencies: ['qb-core'], installFolder: '[spawn]',
  },
  {
    id: 'esx_multicharacter', name: 'esx_multicharacter', description: 'ESX multi-character with character slots, creation screen, and deletion.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_multicharacter', category: 'Spawn', stars: 75, installed: false, dependencies: ['es_extended'], replaces: ['qb-multicharacter'], installFolder: '[spawn]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS / UI
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ox_notify', name: 'ox_lib notifications', description: 'Built into ox_lib — clean notification system with types, duration, and positioning.',
    author: 'overextended', repo: 'https://github.com/overextended/ox_lib', category: 'UI', stars: 820, installed: false, installFolder: '[core]',
  },
  {
    id: 'okokNotify', name: 'okokNotify', description: 'OKOK Notifications — beautiful toast notifications with multiple styles and animations.',
    author: 'okok-scripts', repo: 'https://github.com/okok-scripts/okokNotify', category: 'UI', stars: 100, installed: false, installFolder: '[ui]',
  },
  {
    id: 'qb-menu', name: 'qb-menu', description: 'QBCore context menu — clean right-click style menu for interactions and options.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-menu', category: 'UI', stars: 70, installed: false, dependencies: ['qb-core'], installFolder: '[ui]',
  },
  {
    id: 'qb-input', name: 'qb-input', description: 'QBCore input dialog — configurable form inputs for player data entry.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-input', category: 'UI', stars: 50, installed: false, dependencies: ['qb-core'], installFolder: '[ui]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MLOs / MAPS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'fivem-maps-gabz', name: 'Gabz MLOs Collection', description: 'Free Gabz MLO interiors — police station, hospital, mechanic, and more.',
    author: 'GabzV', repo: 'https://github.com/GabzV/fivem-gabz-mapfree', category: 'MLO', stars: 350, installed: false, installFolder: '[maps]',
  },
  {
    id: 'bob74_ipl', name: 'bob74_ipl', description: 'Interior loader — unlock all GTA Online interiors (apartments, offices, nightclubs, bunkers).',
    author: 'Bob74', repo: 'https://github.com/Bob74/bob74_ipl', category: 'MLO', stars: 280, installed: false, installFolder: '[maps]',
  },
  {
    id: 'fivem-freecam', name: 'fivem-freecam', description: 'Free camera mode for exploring and positioning — useful for setting up MLOs and spawns.',
    author: 'Starter-Scripts', repo: 'https://github.com/pongo1231/fivem-freecam', category: 'MLO', stars: 70, installed: false, installFolder: '[maps]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRIMINAL / DRUGS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-drugs', name: 'qb-drugs', description: 'QBCore drug system — growing, processing, selling weed, coke, meth with animations.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-drugs', category: 'Criminal', stars: 100, installed: false, dependencies: ['qb-core'], installFolder: '[criminal]',
  },
  {
    id: 'qb-storerobbery', name: 'qb-storerobbery', description: 'QBCore store robbery — register robbery, safe cracking, police alerts, and cooldowns.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-storerobbery', category: 'Criminal', stars: 80, installed: false, dependencies: ['qb-core'], installFolder: '[criminal]',
  },
  {
    id: 'qb-bankrobbery', name: 'qb-bankrobbery', description: 'QBCore bank heist — thermite, hacking minigame, vault, police alerts, and loot.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-bankrobbery', category: 'Criminal', stars: 120, installed: false, dependencies: ['qb-core'], installFolder: '[criminal]',
  },
  {
    id: 'qb-prison', name: 'qb-prison', description: 'QBCore prison system — jail with activities, sentence time, and commissary.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-prison', category: 'Criminal', stars: 75, installed: false, dependencies: ['qb-core'], installFolder: '[criminal]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOD / NEEDS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'esx_basicneeds', name: 'esx_basicneeds', description: 'ESX hunger and thirst system with consumable items and status effects.',
    author: 'esx-framework', repo: 'https://github.com/esx-framework/esx_basicneeds', category: 'Survival', stars: 50, installed: false, dependencies: ['es_extended'], installFolder: '[standalone]',
  },
  {
    id: 'qb-smallresources', name: 'qb-smallresources', description: 'QBCore utility pack — seatbelts, consumables, weapon draw, and small gameplay tweaks.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-smallresources', category: 'Survival', stars: 90, installed: false, dependencies: ['qb-core'], installFolder: '[standalone]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GANGS / FACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'qb-gangs', name: 'qb-gangs', description: 'QBCore gang system with turf wars, gang stash, ranks, and territory control.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/qb-gangs', category: 'Gangs', stars: 65, installed: false, dependencies: ['qb-core'], installFolder: '[gangs]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'loadingscreen', name: 'loadingscreen', description: 'Customizable loading screen with music, progress bar, server info, and rules display.',
    author: 'qbcore-framework', repo: 'https://github.com/qbcore-framework/loadingscreen', category: 'UI', stars: 65, installed: false, installFolder: '[standalone]',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RACING / FUN
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'cw-racingapp', name: 'cw-racingapp', description: 'Street racing app — create tracks, race with friends, leaderboards, and betting.',
    author: 'cw-scripts', repo: 'https://github.com/cw-scripts/cw-racingapp', category: 'Fun', stars: 160, installed: false, dependencies: ['ox_lib'], installFolder: '[fun]',
  },
];

const categoryColors: Record<string, string> = {
  Core: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Framework: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Voice: 'bg-green-500/20 text-green-300 border-green-500/30',
  Inventory: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Utility: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Phone: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Character: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  Economy: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Jobs: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Vehicles: 'bg-red-500/20 text-red-300 border-red-500/30',
  Housing: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  Admin: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  HUD: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Interaction: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  MLO: 'bg-lime-500/20 text-lime-300 border-lime-500/30',
  Criminal: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  Survival: 'bg-stone-500/20 text-stone-300 border-stone-500/30',
  Spawn: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  UI: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Environment: 'bg-green-600/20 text-green-200 border-green-600/30',
  Gangs: 'bg-red-600/20 text-red-200 border-red-600/30',
  Fun: 'bg-pink-600/20 text-pink-200 border-pink-600/30',
};

export default function Marketplace() {
  const { activeServerId, servers, logAction } = useAppStore();
  const [items, setItems] = useState(MARKETPLACE_ITEMS);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [installing, setInstalling] = useState<string | null>(null);

  const activeServer = servers.find(s => s.id === activeServerId);
  const sortedCategories = [...new Set(items.map(i => i.category))].sort();
  const categories = ['all', ...sortedCategories];

  const installItem = async (item: MarketplaceItem) => {
    if (!activeServer) {
      toast.error('Select a server first');
      return;
    }

    // Check if this resource replaces an existing one
    const replacedItems = item.replaces
      ? items.filter(i => item.replaces!.includes(i.id) && i.installed)
      : [];

    setInstalling(item.id);
    try {
      const folder = item.installFolder || '[standalone]';
      if (window.electronAPI) {
        // Remove replaced resources first
        for (const replaced of replacedItems) {
          const oldFolder = replaced.installFolder || '[standalone]';
          const oldPath = `${activeServer.installPath}\\resources\\${oldFolder}\\${replaced.name}`;
          try { await window.electronAPI.file.delete(oldPath); } catch {}
        }

        const dest = `${activeServer.installPath}\\resources\\${folder}\\${item.name}`;
        // Create folder if needed
        try { await window.electronAPI.file.createDir(`${activeServer.installPath}\\resources\\${folder}`); } catch {}
        const result = await window.electronAPI.git.clone(item.repo, dest);
        if (!result.success) throw new Error(result.error);

        // Update server.cfg — remove old ensures, add new one
        try {
          const cfgPath = `${activeServer.installPath}\\server.cfg`;
          let cfg = await window.electronAPI.file.readFile(cfgPath);
          // Remove replaced resource ensures
          for (const replaced of replacedItems) {
            cfg = cfg.replace(new RegExp(`^\\s*ensure\\s+${replaced.name}\\s*$`, 'gm'), '');
          }
          // Add new ensure if not present
          if (!cfg.includes(`ensure ${item.name}`)) {
            cfg = cfg.trimEnd() + `\nensure ${item.name}\n`;
          }
          await window.electronAPI.file.writeFile(cfgPath, cfg);
        } catch {}
      } else {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
      }

      setItems(prev => prev.map(i => {
        if (i.id === item.id) return { ...i, installed: true };
        if (replacedItems.find(r => r.id === i.id)) return { ...i, installed: false };
        return i;
      }));

      if (replacedItems.length > 0) {
        logAction('Resource Replaced', `${replacedItems.map(r => r.name).join(', ')} → ${item.name}`, 'success');
        toast.success(`${item.name} installed, replaced ${replacedItems.map(r => r.name).join(', ')}`);
      } else {
        logAction('Resource Installed', `${item.name} from marketplace`, 'success');
        toast.success(`${item.name} installed successfully`);
      }
    } catch (e: any) {
      toast.error(e.message || 'Installation failed');
      logAction('Install Failed', `${item.name}: ${e.message}`, 'error');
    } finally {
      setInstalling(null);
    }
  };

  const uninstallItem = async (item: MarketplaceItem) => {
    if (!activeServer) return;
    setInstalling(item.id);
    try {
      if (window.electronAPI) {
        const folder = item.installFolder || '[standalone]';
        const dest = `${activeServer.installPath}\\resources\\${folder}\\${item.name}`;
        await window.electronAPI.file.delete(dest);
        // Remove from server.cfg
        try {
          const cfgPath = `${activeServer.installPath}\\server.cfg`;
          let cfg = await window.electronAPI.file.readFile(cfgPath);
          cfg = cfg.replace(new RegExp(`^\\s*ensure\\s+${item.name}\\s*$`, 'gm'), '');
          await window.electronAPI.file.writeFile(cfgPath, cfg);
        } catch {}
      } else {
        await new Promise(r => setTimeout(r, 600));
      }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, installed: false } : i));
      logAction('Resource Removed', item.name, 'info');
      toast.success(`${item.name} removed`);
    } catch {
      toast.error('Failed to remove resource');
    } finally {
      setInstalling(null);
    }
  };

  const filtered = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.author.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const installedCount = items.filter(i => i.installed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="text-sm text-surface-400 mt-1">
            {filtered.length} resources available · {installedCount} installed · {sortedCategories.length} categories
          </p>
        </div>
        {!activeServer && (
          <span className="text-xs px-3 py-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg">
            Select a server to install resources
          </span>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            className="input-field pl-9"
            placeholder="Search resources, authors, descriptions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Category pills — scrollable */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filterCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
            }`}
          >
            {cat === 'all' ? `All (${items.length})` : `${cat} (${items.filter(i => i.category === cat).length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.5) }}
            className="card flex flex-col group hover:border-surface-500/50"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white truncate group-hover:text-primary-300 transition-colors">{item.name}</h3>
                  {item.version && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-surface-700 rounded text-surface-400 shrink-0">
                      v{item.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-400">{item.author}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                categoryColors[item.category] || 'bg-surface-700/50 text-surface-300 border-surface-600'
              }`}>
                {item.category}
              </span>
            </div>

            <p className="text-xs text-surface-300 flex-1 leading-relaxed line-clamp-3">{item.description}</p>

            {item.dependencies && item.dependencies.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                <span className="text-[10px] text-surface-500">Requires:</span>
                {item.dependencies.map(dep => (
                  <span key={dep} className="text-[10px] px-1.5 py-0.5 bg-surface-800 rounded text-surface-400">{dep}</span>
                ))}
              </div>
            )}

            {item.replaces && item.replaces.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <ArrowLeftRight size={10} className="text-surface-500" />
                <span className="text-[10px] text-surface-500">Replaces: {item.replaces.join(', ')}</span>
              </div>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-700/50">
              <div className="flex items-center gap-1.5">
                <Star size={12} className="text-amber-400" />
                <span className="text-xs text-surface-400">{item.stars.toLocaleString()}</span>
              </div>
              {item.installed ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                    <CheckCircle2 size={14} />
                    Installed
                  </span>
                  <button
                    onClick={() => uninstallItem(item)}
                    disabled={installing === item.id}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 bg-red-500/10 rounded hover:bg-red-500/20 transition-colors"
                  >
                    {installing === item.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => installItem(item)}
                  disabled={installing === item.id || !activeServer}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {installing === item.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  Install
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Store size={40} className="text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400">No resources match your search</p>
        </div>
      )}
    </motion.div>
  );
}
