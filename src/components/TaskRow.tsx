import { Link } from 'react-router-dom';
import type { Task } from '@shared/types';
import { formatDateTime, formatDueDate } from '@/lib/format';
import { entityPath } from '@/lib/hooks';
import { useAppMeta } from '@/lib/meta';
import { Icon } from './Icon';
import { TaskPriorityBadge, TaskStatusBadge } from './ui';

export function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  showRelated = false,
  busy = false,
}: {
  task: Task;
  onToggle?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  showRelated?: boolean;
  busy?: boolean;
}) {
  const meta = useAppMeta();
  const dueClass =
    task.status === 'open'
      ? task.isOverdue
        ? 'due overdue'
        : task.dueDate === meta.today
          ? 'due today'
          : ''
      : '';

  return (
    <div className={`task-row ${task.status === 'done' ? 'done' : ''}`}>
      <input
        type="checkbox"
        className="task-row-check"
        checked={task.status === 'done'}
        onChange={() => onToggle?.(task)}
        disabled={busy || !onToggle}
        aria-label={task.status === 'done' ? 'Вернуть задачу в работу' : 'Отметить выполненной'}
      />
      <div className="task-row-main">
        <div className="task-row-title">
          <span>{task.title}</span>
          <TaskStatusBadge status={task.status} />
          {task.priority !== 'medium' ? <TaskPriorityBadge priority={task.priority} /> : null}
        </div>
        <div className="task-row-meta">
          <span className={dueClass}>
            {task.status === 'done'
              ? `Выполнена ${task.completedAt ? formatDateTime(task.completedAt) : ''}`.trim()
              : formatDueDate(task.dueDate, meta.today)}
          </span>
          {showRelated ? (
            <Link to={entityPath(task.relatedTo.type, task.relatedTo.id)}>
              {task.relatedLabel}
            </Link>
          ) : null}
          {task.description ? (
            <span className="task-row-description" title={task.description}>
              {task.description}
            </span>
          ) : null}
        </div>
      </div>
      {onEdit || onDelete ? (
        <div className="task-row-actions">
          {onEdit ? (
            <button
              type="button"
              className="icon-action"
              onClick={() => onEdit(task)}
              aria-label="Редактировать задачу"
            >
              <Icon name="edit" size={14} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="icon-action danger"
              onClick={() => onDelete(task)}
              aria-label="Удалить задачу"
            >
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
