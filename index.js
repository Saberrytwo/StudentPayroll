const express = require('express')
const cors = require('cors')
const bodyParser = require("body-parser");
const app = express()
const port = 3001

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host : 'classproject.cluster-cbdo9oytyewz.us-east-2.rds.amazonaws.com',
    port : 3306,
    user : 'admin',
    password : 'admin123',
    database : 'studentemploymentdb'
  }
});

app.get('/', (req, res) => {
  res.send({
    code: 200,
    health: "Healthy"
  })
});

app.get('/get-table-data', async (req, res) => {
  const supervisors = await knex('Supervisor');
  const positions = await knex('Position');
  const years = await knex('EmployeeSemesterPositionLink').distinct().pluck('year');

  console.log(req.query)

  var supervisorsWithEmployees = await Promise.all(supervisors.map(async el => {
    return knex('EmployeeSemesterPositionLink')
      .join('Position', 'Position.id', 'EmployeeSemesterPositionLink.positionId')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'Employee.byuId', 'EmployeePayInfo.employeeId')
      .join('Semester', 'Semester.id', 'EmployeeSemesterPositionLink.semesterId')
      .where('supervisorId', el.id)
      .where('semester', req.query.semester)
      .where('year', req.query.year).then(employees => {
      return {
        supervisor: {
          id: el.id,
          firstName: el.firstName,
          lastName: el.lastName
        },
        employees: employees
      }
    })
  }));

  const response = 
  { 
    positions: positions, 
    years: years.sort(function(a, b) {
    return b - a;
    }), 
    supervisors: supervisorsWithEmployees 
  }

  console.log(response)
  res.send(response);
});

app.get('/get-report-data', async (req, res) => {
  const employees = await knex('Employee').join('EmployeeSemesterPositionLink', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId');
  const taCount = employees.filter(emp => emp.position === 1).length;
  const raCount = employees.filter(emp => emp.position === 2).length;

  const reportsData = {
    barChart: {
      taCount: taCount,
      raCount: raCount
    }
  }

  res.send(reportsData);
});

app.post('/update-row', (req, res) => {
  console.log(req.body.column);
  console.log(req.body.value)
  knex('EmployeeSemesterPositionLink')
      .join('Employee', 'Employee.byuId', 'EmployeeSemesterPositionLink.employeeId')
      .join('EmployeePayInfo', 'Employee.byuId', 'EmployeePayInfo.employeeId')
  .where('byuId', req.body.byuId)
  .update({
    [req.body.column]: req.body.value
  }).then(result => { res.status(200); res.send(); })
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})