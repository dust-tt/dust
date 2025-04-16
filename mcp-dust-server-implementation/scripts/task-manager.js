#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Get current file directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to tasks.json
const tasksJsonPath = path.join(__dirname, '..', 'tasks.json');

// Path to tasks directory
const tasksDir = path.join(__dirname, '..', 'tasks');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Load tasks from tasks.json
function loadTasks() {
  try {
    const tasksJson = fs.readFileSync(tasksJsonPath, 'utf8');
    return JSON.parse(tasksJson);
  } catch (error) {
    console.error(`Error loading tasks: ${error.message}`);
    return { tasks: [] };
  }
}

// Save tasks to tasks.json
function saveTasks(tasks) {
  try {
    fs.writeFileSync(tasksJsonPath, JSON.stringify(tasks, null, 2));
    console.log('Tasks saved successfully.');
  } catch (error) {
    console.error(`Error saving tasks: ${error.message}`);
  }
}

// List all tasks
function listTasks() {
  const tasks = loadTasks();
  console.log('\nTasks:');
  tasks.tasks.forEach(task => {
    const status = task.status === 'DONE' ? '✅' : task.status === 'IN_PROGRESS' ? '🔄' : '⏳';
    console.log(`${status} ${task.id}. ${task.title} (${task.priority})`);
  });
  console.log('');
}

// Show task details
function showTask(id) {
  const tasks = loadTasks();
  const task = tasks.tasks.find(t => t.id === parseInt(id));
  if (!task) {
    console.error(`Task ${id} not found.`);
    return;
  }

  console.log(`\n# Task ${task.id}: ${task.title}`);
  console.log(`Status: ${task.status}`);
  console.log(`Priority: ${task.priority}`);
  console.log(`Dependencies: ${task.dependencies.join(', ') || 'None'}`);
  console.log(`\nDescription: ${task.description}`);

  console.log('\nSubtasks:');
  task.subtasks.forEach((subtask, index) => {
    console.log(`${index + 1}. ${subtask}`);
  });
  console.log('');
}

// Update task status
function updateTaskStatus(id, status) {
  const tasks = loadTasks();
  const taskIndex = tasks.tasks.findIndex(t => t.id === parseInt(id));
  if (taskIndex === -1) {
    console.error(`Task ${id} not found.`);
    return;
  }

  tasks.tasks[taskIndex].status = status;
  saveTasks(tasks);
  console.log(`Task ${id} status updated to ${status}.`);
}

// Get next task
function getNextTask() {
  const tasks = loadTasks();

  // Find tasks that are not done and have all dependencies satisfied
  const availableTasks = tasks.tasks.filter(task => {
    if (task.status === 'DONE') return false;

    // Check if all dependencies are done
    const unsatisfiedDependencies = task.dependencies.filter(depId => {
      const depTask = tasks.tasks.find(t => t.id === depId);
      return depTask && depTask.status !== 'DONE';
    });

    return unsatisfiedDependencies.length === 0;
  });

  if (availableTasks.length === 0) {
    console.log('No available tasks found.');
    return;
  }

  // Sort by priority (HIGH > MEDIUM > LOW)
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  availableTasks.sort((a, b) => {
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const nextTask = availableTasks[0];
  console.log(`\nNext task: #${nextTask.id} ${nextTask.title}`);
  console.log(`Status: ${nextTask.status}`);
  console.log(`Priority: ${nextTask.priority}`);
  console.log(`\nDescription: ${nextTask.description}`);

  console.log('\nSubtasks:');
  nextTask.subtasks.forEach((subtask, index) => {
    console.log(`${index + 1}. ${subtask}`);
  });

  console.log('\nCommands:');
  console.log(`- Start working on this task: node scripts/task-manager.js update ${nextTask.id} IN_PROGRESS`);
  console.log(`- Mark this task as done: node scripts/task-manager.js update ${nextTask.id} DONE`);
  console.log('');
}

// Main function
function main() {
  const command = process.argv[2];

  if (!command) {
    console.log('Usage:');
    console.log('  node scripts/task-manager.js list');
    console.log('  node scripts/task-manager.js show <id>');
    console.log('  node scripts/task-manager.js update <id> <status>');
    console.log('  node scripts/task-manager.js next');
    process.exit(0);
  }

  switch (command) {
    case 'list':
      listTasks();
      break;
    case 'show':
      const id = process.argv[3];
      if (!id) {
        console.error('Task ID is required.');
        break;
      }
      showTask(id);
      break;
    case 'update':
      const taskId = process.argv[3];
      const status = process.argv[4];
      if (!taskId || !status) {
        console.error('Task ID and status are required.');
        break;
      }
      updateTaskStatus(taskId, status);
      break;
    case 'next':
      getNextTask();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      break;
  }

  process.exit(0);
}

main();
